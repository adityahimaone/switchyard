package kanban

// ResolveDesignSlice is the create-time boundary between a live Doop canvas and
// an immutable card. It is the ONLY place that talks to Doop. Everything after
// it — the card, the dispatcher, the worker, the review gate — reads files.

import (
	"context"
	"fmt"
	"strings"
)

// DesignSliceRequest is what the Create Task picker posts.
type DesignSliceRequest struct {
	Slug            string   `json:"-"`
	Provider        string   `json:"provider,omitempty"`
	CanvasID        string   `json:"canvas_id"`
	FrameID         string   `json:"frame_id"`
	Version         string   `json:"version,omitempty"`
	Selectors       []string `json:"selectors,omitempty"`
	AllowUnapproved bool     `json:"allow_unapproved,omitempty"`
}

// DesignSliceResponse is what the card stores plus what the picker previews.
type DesignSliceResponse struct {
	DesignSlice
	Cached     bool   `json:"cached"`
	PreviewURL string `json:"preview_url"`
	Ref        string `json:"ref"`
}

// ResolveDesignSlice snapshots one frame. `cached` reports a store hit.
func ResolveDesignSlice(ctx context.Context, cfg DoopConfig, req DesignSliceRequest) (*DesignSliceResponse, bool, error) {
	canvasID := strings.TrimSpace(req.CanvasID)
	frameID := strings.TrimSpace(req.FrameID)
	if canvasID == "" || frameID == "" {
		return nil, false, fmt.Errorf("canvas_id and frame_id are required")
	}
	if _, err := DesignSliceDir(req.Slug, "0000000000000000"); err != nil {
		return nil, false, err
	}
	client := NewDoopClient(cfg)
	frame, err := client.GetFrame(ctx, canvasID, frameID)
	if err != nil {
		return nil, false, err
	}
	if frame.HTML == "" {
		return nil, false, fmt.Errorf("doop frame %s has no HTML", frameID)
	}
	if status := strings.ToLower(strings.TrimSpace(frame.ApprovalStatus)); status != "" && status != "ready_for_dev" && !req.AllowUnapproved {
		return nil, false, fmt.Errorf("frame %s is %q, not ready_for_dev", frameID, frame.ApprovalStatus)
	}

	version := strings.TrimSpace(req.Version)
	if version == "" {
		version = strings.TrimSpace(frame.Version)
	}
	if version == "" {
		// A build without frame versions still gets a stable, content-derived
		// identity, so the same HTML never produces two snapshots.
		version = "sha:" + Fingerprint(frame.HTML)
	}
	ref := DoopRef{CanvasID: canvasID, FrameID: frameID, Version: version}
	key := ref.Key()

	if cached, _, loadErr := LoadDesignSlice(req.Slug, key); loadErr == nil {
		return &DesignSliceResponse{
			DesignSlice: *cached,
			Cached:      true,
			PreviewURL:  DesignSlicePreviewURL(req.Slug, key),
			Ref:         ref.Canonical(),
		}, true, nil
	}

	png, err := client.Screenshot(ctx, frameID)
	if err != nil {
		return nil, false, fmt.Errorf("doop frame %s resolved but its PNG did not: %w", frameID, err)
	}
	slice := &DesignSlice{
		Key:            key,
		Slug:           req.Slug,
		DesignRef:      ref.Canonical(),
		DesignSource:   ref.DesignSourcePath(),
		CanvasID:       canvasID,
		FrameID:        frameID,
		FrameName:      frame.Name,
		Version:        version,
		ApprovalStatus: frame.ApprovalStatus,
		Selectors:      NormalizeSelectors(req.Selectors),
		Width:          frame.Width,
		Height:         frame.Height,
		Guidelines:     client.GetGuidelines(ctx, canvasID),
		SourceURL:      ref.Canonical(),
	}
	if err := SaveDesignSlice(slice, frame.HTML, png); err != nil {
		return nil, false, err
	}
	return &DesignSliceResponse{
		DesignSlice: *slice,
		Cached:      false,
		PreviewURL:  DesignSlicePreviewURL(req.Slug, key),
		Ref:         ref.Canonical(),
	}, false, nil
}

// DoopRefForCard parses the ref stored on a card. A malformed ref is a data
// error, not a reason to dispatch a card without its design contract.
func DoopRefForCard(ref string) (DoopRef, error) {
	return ParseDoopRef(ref)
}

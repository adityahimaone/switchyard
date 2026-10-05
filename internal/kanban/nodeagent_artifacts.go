package kanban

// Artifact transport: pulling the files a worker produced back into the
// control plane's own attachment store.
//
// The worker never posts to /api/attachments itself. Every /api/* route on
// Switchyard is behind authHandler and a kanban_session cookie, and handing a
// node that credential would be a far worse trade than one pull. So the node
// keeps the bytes on disk, reports the metadata in the result it already posts,
// and the control plane fetches each file over the token-authenticated
// node-agent client and stores it itself.

import (
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"path"
	"strings"
	"time"
)

// maxArtifactBytes caps a single pulled artifact. It matches the blobstore's
// own 10MB ceiling, so a file that passes here cannot be rejected on store —
// and, more importantly, a hostile or broken node cannot make the control plane
// buffer an unbounded response body.
const maxArtifactBytes = 10 << 20

// artifactPullTimeout bounds one artifact fetch. The node is on the tailnet and
// the file is already on its disk, so this is generous.
const artifactPullTimeout = 60 * time.Second

// artifactNameValid keeps a reported artifact name to something safe to use as
// a filename and a URL path segment.
//
// The name comes from the worker, which is a machine we trust to be
// well-behaved but not a machine we trust blindly: it is reached over the
// network, and a bug or a compromise there should not become a path traversal
// or a header injection here. Rejecting rather than sanitising keeps the
// failure loud and the stored filename honest about what was on disk.
func artifactNameValid(name string) bool {
	if name == "" || len(name) > 128 {
		return false
	}
	if name != path.Base(name) {
		return false
	}
	for _, r := range name {
		switch {
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r >= '0' && r <= '9':
		case r == '.' || r == '_' || r == '-':
		default:
			return false
		}
	}
	return name != "." && name != ".."
}

// pullNodeArtifact fetches one artifact from a node.
//
// The requested path is never used to build a URL. The node's own artifact
// endpoint looks the file up by task id and file name under its artifact root,
// so a node cannot be made to serve an arbitrary path by anything in this
// process.
func pullNodeArtifact(taskID, name string) ([]byte, error) {
	if !artifactNameValid(name) {
		return nil, fmt.Errorf("artifact %q: name is not a safe filename", name)
	}
	endpoint := fmt.Sprintf("%s/api/nodes/artifacts/%s/%s",
		nodeAgentBase(), url.PathEscape(taskID), url.PathEscape(name))

	req, err := http.NewRequest("GET", endpoint, nil)
	if err != nil {
		return nil, err
	}
	if tok := nodeAgentToken(); tok != "" {
		req.Header.Set("X-Node-Agent-Token", tok)
	}
	client := &http.Client{Timeout: artifactPullTimeout}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("artifact %q: node returned %s", name, resp.Status)
	}
	data, err := io.ReadAll(io.LimitReader(resp.Body, maxArtifactBytes+1))
	if err != nil {
		return nil, err
	}
	if int64(len(data)) > maxArtifactBytes {
		return nil, fmt.Errorf("artifact %q: larger than %d bytes", name, int64(maxArtifactBytes))
	}
	return data, nil
}

// ingestNodeArtifacts pulls each artifact for a task and links it to the card.
//
// A failure on one file does not fail the run: a verify pass with three of four
// screenshots is far more useful than a hard error, and the missing file is
// visible as a gap. The collected ids are returned so the review UI can show
// exactly which evidence arrived.
//
// Linking is idempotent — the join is INSERT OR IGNORE on (task, attachment) and
// the blobstore dedups by SHA — so a re-run of verify does not duplicate rows.
func ingestNodeArtifacts(slug, taskID string, artifacts []NodeArtifact) []string {
	if len(artifacts) == 0 {
		return nil
	}
	var linked []string
	for _, a := range artifacts {
		if !artifactNameValid(a.Name) {
			log.Printf("verify: %s: rejecting artifact with unsafe name %q", taskID, a.Name)
			continue
		}
		data, err := pullNodeArtifact(taskID, a.Name)
		if err != nil {
			log.Printf("verify: %s: artifact %q: %v", taskID, a.Name, err)
			continue
		}
		// Name the stored file after the artifact so a reviewer downloads
		// something meaningful, but keep the worker's own extension as the
		// fallback for a name with none.
		filename := a.Name
		if path.Ext(filename) == "" && a.MIME != "" {
			if ext := mimeExt(a.MIME); ext != "" {
				filename += ext
			}
		}
		att, err := StoreAttachmentBytes(data, filename)
		if err != nil {
			log.Printf("verify: %s: storing artifact %q: %v", taskID, a.Name, err)
			continue
		}
		if err := LinkTaskAttachment(slug, taskID, att.ID); err != nil {
			log.Printf("verify: %s: linking artifact %q: %v", taskID, a.Name, err)
			continue
		}
		linked = append(linked, att.ID)
	}
	return linked
}

// mimeExt maps the artifact MIME types worth storing to a file extension.
// Only images and PDFs are listed, because those are the only types the
// attachment store's allowlist accepts — a screenshot is the point, and
// anything else would be rejected at the next hop anyway.
func mimeExt(mime string) string {
	switch strings.ToLower(strings.TrimSpace(mime)) {
	case "image/png":
		return ".png"
	case "image/jpeg":
		return ".jpg"
	case "image/webp":
		return ".webp"
	case "image/gif":
		return ".gif"
	case "application/pdf":
		return ".pdf"
	}
	return ""
}

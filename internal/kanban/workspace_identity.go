package kanban

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"unicode"

	"gopkg.in/yaml.v3"
)

// Workspace identity is the name and avatar for the Switchyard workspace itself,
// as opposed to an agent profile. There are no user accounts — the workspace is
// guarded by one shared password — so this is deliberately a single global
// record rather than something keyed by user.

type WorkspaceIdentity struct {
	// Name is the display label. Empty means "not set"; the client owns the
	// fallback, so the server never invents a name for this workspace.
	Name string `yaml:"name" json:"name"`
	// AvatarURL is an external http(s) image. Mutually exclusive with an
	// uploaded avatar blob — see SetWorkspaceAvatarURL.
	AvatarURL string `yaml:"avatar_url" json:"avatar_url"`
}

func workspaceIdentityPath() string {
	return filepath.Join(hermesHome(), "workspace-identity.yaml")
}

func workspaceAvatarPaths() (raw, meta string) {
	base := filepath.Join(hermesHome(), "workspace-avatar")
	return base, base + ".json"
}

// LoadWorkspaceIdentity returns the stored identity. A missing file is an
// unconfigured workspace, not a failure: the app has to work before anyone has
// opened the settings page.
func LoadWorkspaceIdentity() (WorkspaceIdentity, error) {
	id := WorkspaceIdentity{}
	raw, err := os.ReadFile(workspaceIdentityPath())
	if os.IsNotExist(err) {
		return id, nil
	}
	if err != nil {
		return WorkspaceIdentity{}, err
	}
	if err := yaml.Unmarshal(raw, &id); err != nil {
		// Fall back to zero rather than propagating: a hand-edited yaml should
		// not take the top bar down, and SaveWorkspaceIdentity will overwrite it.
		return WorkspaceIdentity{}, nil
	}
	id.Name = normalizeWorkspaceName(id.Name)
	return id, nil
}

// WorkspaceIdentityView is what the API returns: the stored record plus the
// avatar URL the client should actually render. Uploaded bytes and an external
// URL are two ways to answer one question, so the client gets one resolved
// field rather than having to know which storage is in play.
type WorkspaceIdentityView struct {
	WorkspaceIdentity `yaml:",inline"`
	// ResolvedAvatarURL is either "/api/workspace/avatar" (an uploaded blob, and
	// therefore cache-busted by the client) or the external URL. Empty when the
	// workspace has no avatar.
	ResolvedAvatarURL string `yaml:"-" json:"avatar_url"`
	// HasUploadedAvatar distinguishes the two cases for clients that need to
	// decide whether a change will be cache-busted.
	HasUploadedAvatar bool `yaml:"-" json:"has_uploaded_avatar"`
}

func GetWorkspaceIdentityView() (WorkspaceIdentityView, error) {
	id, err := LoadWorkspaceIdentity()
	if err != nil {
		return WorkspaceIdentityView{}, err
	}
	view := WorkspaceIdentityView{WorkspaceIdentity: id}
	if _, _, ok := WorkspaceAvatar(); ok {
		view.ResolvedAvatarURL = "/api/workspace/avatar"
		view.HasUploadedAvatar = true
	} else {
		view.ResolvedAvatarURL = id.AvatarURL
	}
	return view, nil
}

const maxWorkspaceNameLen = 64

// normalizeWorkspaceName collapses the whitespace a name picked up from a paste.
// Runs before validation so the stored value is exactly what renders back.
func normalizeWorkspaceName(raw string) string {
	return strings.TrimSpace(strings.Join(strings.Fields(raw), " "))
}

func validateWorkspaceName(name string) error {
	if name == "" {
		return nil // clearing the name is allowed; the client falls back
	}
	if len([]rune(name)) > maxWorkspaceNameLen {
		return fmt.Errorf("workspace name too long (max %d characters)", maxWorkspaceNameLen)
	}
	for _, r := range name {
		// normalizeWorkspaceName has already collapsed whitespace, so newlines
		// and tabs cannot reach here — this catches what it does not strip, a
		// null byte or an escape sequence, which would corrupt the layout the
		// name renders into.
		if unicode.IsControl(r) {
			return fmt.Errorf("workspace name contains a control character")
		}
	}
	return nil
}

// SetWorkspaceName updates only the display name and leaves the avatar
// untouched. This is what the settings form uses: a rename and an avatar
// change are independent edits, and a partial update that omitted avatar_url
// would otherwise be read as "clear the avatar".
func SetWorkspaceName(name string) (WorkspaceIdentity, error) {
	id, err := LoadWorkspaceIdentity()
	if err != nil {
		return WorkspaceIdentity{}, err
	}
	id.Name = normalizeWorkspaceName(name)
	if err := validateWorkspaceName(id.Name); err != nil {
		return WorkspaceIdentity{}, err
	}
	return SaveWorkspaceIdentity(id)
}

// SaveWorkspaceIdentity writes the record atomically. It deliberately does NOT
// touch the uploaded avatar blob: renaming the workspace and replacing its
// avatar are independent operations, and discarding someone's avatar because
// they typed a new name would be wrong.
func SaveWorkspaceIdentity(id WorkspaceIdentity) (WorkspaceIdentity, error) {
	id.Name = normalizeWorkspaceName(id.Name)
	if err := validateWorkspaceName(id.Name); err != nil {
		return WorkspaceIdentity{}, err
	}
	if len(id.AvatarURL) > 2048 {
		return WorkspaceIdentity{}, fmt.Errorf("avatar URL too long")
	}
	if id.AvatarURL != "" && !validAvatarURL(id.AvatarURL) {
		return WorkspaceIdentity{}, fmt.Errorf("avatar URL must be public http(s) URL")
	}
	if err := os.MkdirAll(hermesHome(), 0o700); err != nil {
		return WorkspaceIdentity{}, err
	}
	raw, err := yaml.Marshal(id)
	if err != nil {
		return WorkspaceIdentity{}, err
	}
	tmp := workspaceIdentityPath() + ".tmp"
	if err := os.WriteFile(tmp, raw, 0o600); err != nil {
		return WorkspaceIdentity{}, err
	}
	if err := os.Rename(tmp, workspaceIdentityPath()); err != nil {
		_ = os.Remove(tmp)
		return WorkspaceIdentity{}, err
	}
	return id, nil
}

// SetWorkspaceAvatarURL points the identity avatar at an external image. An empty
// URL removes the avatar, which is why removal is folded in here rather than
// exposed as a second operation: the caller should not have to know which state
// it is leaving.
func SetWorkspaceAvatarURL(rawURL string) (WorkspaceIdentity, error) {
	id, err := LoadWorkspaceIdentity()
	if err != nil {
		return WorkspaceIdentity{}, err
	}
	rawURL = strings.TrimSpace(rawURL)
	if rawURL == "" {
		// Clearing the URL must also drop an uploaded blob, or it would silently
		// reappear as the avatar the moment the URL was removed.
		_ = RemoveWorkspaceAvatar()
		id.AvatarURL = ""
		return SaveWorkspaceIdentity(id)
	}
	if len(rawURL) > 2048 {
		return WorkspaceIdentity{}, fmt.Errorf("avatar URL too long")
	}
	if !validAvatarURL(rawURL) {
		return WorkspaceIdentity{}, fmt.Errorf("avatar URL must be public http(s) URL")
	}
	// A URL and an uploaded blob are two answers to one question. Keeping both
	// would make the winner depend on removal order.
	_ = RemoveWorkspaceAvatar()
	id.AvatarURL = rawURL
	return SaveWorkspaceIdentity(id)
}

// SetWorkspaceAvatar stores an uploaded image. Validation mirrors
// SetProfileAvatar: the declared multipart mime is untrusted, so the sniffed
// content type is the trust boundary.
func SetWorkspaceAvatar(mime string, data []byte) error {
	mime = strings.ToLower(strings.TrimSpace(mime))
	if mime == "image/jpg" {
		mime = "image/jpeg"
	}
	isGeneric := mime == "" || mime == "application/octet-stream" || mime == "binary/octet-stream"
	if !isGeneric && !allowedAvatarMimes[mime] {
		return fmt.Errorf("unsupported avatar type %q", mime)
	}
	if len(data) == 0 {
		return fmt.Errorf("avatar empty")
	}
	if len(data) > maxAvatarBytes {
		return fmt.Errorf("avatar too large (%d > %d)", len(data), maxAvatarBytes)
	}
	sniffed := http.DetectContentType(data)
	if !allowedAvatarMimes[sniffed] {
		return fmt.Errorf("avatar content type %q not allowed", sniffed)
	}
	if !isGeneric && sniffed != mime {
		return fmt.Errorf("mime %q does not match content %q", mime, sniffed)
	}
	if err := os.MkdirAll(hermesHome(), 0o700); err != nil {
		return err
	}
	rawPath, metaPath := workspaceAvatarPaths()
	// Write the blob before touching the identity record: a failed record write
	// then leaves an avatar the client will not show, which is recoverable,
	// rather than a record pointing at a blob that was never written.
	if err := writeFileAtomic(rawPath, data, 0o644); err != nil {
		return err
	}
	metaRaw, err := json.Marshal(avatarMeta{Mime: sniffed})
	if err != nil {
		return err
	}
	if err := writeFileAtomic(metaPath, metaRaw, 0o600); err != nil {
		_ = os.Remove(rawPath)
		return err
	}
	// An uploaded blob wins over a URL, so clear the URL that would otherwise
	// keep taking precedence in GetWorkspaceIdentityView.
	id, err := LoadWorkspaceIdentity()
	if err != nil {
		return err
	}
	if id.AvatarURL != "" {
		id.AvatarURL = ""
		if _, err := SaveWorkspaceIdentity(id); err != nil {
			return err
		}
	}
	return nil
}

func writeFileAtomic(path string, data []byte, mode os.FileMode) error {
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, mode); err != nil {
		return err
	}
	if err := os.Rename(tmp, path); err != nil {
		_ = os.Remove(tmp)
		return err
	}
	return nil
}

// WorkspaceAvatar returns the uploaded bytes and mime, if one is stored.
func WorkspaceAvatar() ([]byte, string, bool) {
	rawPath, metaPath := workspaceAvatarPaths()
	metaRaw, err := os.ReadFile(metaPath)
	if err != nil {
		return nil, "", false
	}
	var meta avatarMeta
	if json.Unmarshal(metaRaw, &meta) != nil || meta.Mime == "" {
		return nil, "", false
	}
	data, err := os.ReadFile(rawPath)
	if err != nil {
		return nil, "", false
	}
	return data, meta.Mime, true
}

func HasWorkspaceAvatar() bool {
	_, _, ok := WorkspaceAvatar()
	return ok
}

func RemoveWorkspaceAvatar() error {
	rawPath, metaPath := workspaceAvatarPaths()
	_ = os.Remove(rawPath)
	_ = os.Remove(metaPath)
	return nil
}

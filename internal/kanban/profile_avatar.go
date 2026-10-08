package kanban

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

const maxAvatarBytes = 2 * 1024 * 1024

var allowedAvatarMimes = map[string]bool{
	"image/png":  true,
	"image/jpeg": true,
	"image/gif":  true,
	"image/webp": true,
}

var avatarStorageMu sync.RWMutex
var avatarURLFetcher = fetchAvatarURL

type avatarMeta struct {
	Mime string `json:"mime,omitempty"`
	URL  string `json:"url,omitempty"`
}

func safeAvatarHost(ctx context.Context, host string) ([]net.IPAddr, error) {
	if ip := net.ParseIP(host); ip != nil {
		if unsafeAvatarIP(ip) {
			return nil, fmt.Errorf("avatar URL must resolve to a public address")
		}
		return []net.IPAddr{{IP: ip}}, nil
	}
	ips, err := net.DefaultResolver.LookupIPAddr(ctx, host)
	if err != nil {
		return nil, err
	}
	if len(ips) == 0 {
		return nil, fmt.Errorf("avatar host did not resolve")
	}
	for _, addr := range ips {
		if unsafeAvatarIP(addr.IP) {
			return nil, fmt.Errorf("avatar URL must resolve to a public address")
		}
	}
	return ips, nil
}

func unsafeAvatarIP(ip net.IP) bool {
	if ipv4 := ip.To4(); ipv4 != nil {
		ip = ipv4
	}
	return ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() || ip.IsUnspecified() || ip.IsMulticast()
}

func validAvatarURL(raw string) bool {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || u.User != nil || u.Host == "" || u.Path == "" {
		return false
	}
	if u.Scheme != "https" && u.Scheme != "http" {
		return false
	}
	if ip := net.ParseIP(u.Hostname()); ip != nil && unsafeAvatarIP(ip) {
		return false
	}
	return true
}

func validateAvatarSourceURL(raw string) (string, error) {
	raw = strings.TrimSpace(raw)
	parsed, err := url.Parse(raw)
	if len(raw) > 2048 || !validAvatarURL(raw) || err != nil || parsed.Scheme != "https" {
		return "", fmt.Errorf("avatar URL must be a public https image URL")
	}
	return raw, nil
}

func fetchAvatarURL(raw string) ([]byte, string, error) {
	var err error
	raw, err = validateAvatarSourceURL(raw)
	if err != nil {
		return nil, "", err
	}
	transport := &http.Transport{DialContext: func(ctx context.Context, network, addr string) (net.Conn, error) {
		host, port, err := net.SplitHostPort(addr)
		if err != nil {
			return nil, err
		}
		ips, err := safeAvatarHost(ctx, host)
		if err != nil {
			return nil, err
		}
		dialer := &net.Dialer{Timeout: 4 * time.Second}
		var lastErr error
		for _, ip := range ips {
			conn, err := dialer.DialContext(ctx, network, net.JoinHostPort(ip.IP.String(), port))
			if err == nil {
				return conn, nil
			}
			lastErr = err
		}
		return nil, lastErr
	}}
	defer transport.CloseIdleConnections()
	client := &http.Client{
		Transport:     transport,
		Timeout:       8 * time.Second,
		CheckRedirect: validateAvatarRedirect,
	}
	resp, err := client.Get(raw)
	if err != nil {
		return nil, "", fmt.Errorf("could not fetch avatar image: %w", err)
	}
	return readAvatarResponse(resp)
}

func validateAvatarRedirect(req *http.Request, via []*http.Request) error {
	if len(via) >= 3 || !validAvatarURL(req.URL.String()) || req.URL.Scheme != "https" {
		return fmt.Errorf("avatar URL redirect is not allowed")
	}
	if _, err := safeAvatarHost(req.Context(), req.URL.Hostname()); err != nil {
		return fmt.Errorf("avatar URL redirect host is not public")
	}
	return nil
}

func readAvatarResponse(resp *http.Response) ([]byte, string, error) {
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, "", fmt.Errorf("avatar image returned HTTP %d", resp.StatusCode)
	}
	if resp.ContentLength > maxAvatarBytes {
		return nil, "", fmt.Errorf("avatar image is larger than 2 MiB")
	}
	data, err := io.ReadAll(io.LimitReader(resp.Body, maxAvatarBytes+1))
	if err != nil {
		return nil, "", fmt.Errorf("could not read avatar image: %w", err)
	}
	mime, err := validateAvatarData("application/octet-stream", data)
	if err != nil {
		return nil, "", fmt.Errorf("invalid avatar image: %w", err)
	}
	return data, mime, nil
}

func SetProfileAvatarURL(name, rawURL string) error {
	name = strings.TrimSpace(name)
	if !profileExists(name) {
		return fmt.Errorf("profile %q not found", name)
	}
	rawURL, err := validateAvatarSourceURL(rawURL)
	if err != nil {
		return err
	}
	data, mime, err := avatarURLFetcher(rawURL)
	if err != nil {
		return err
	}
	return SetProfileAvatar(name, mime, data)
}

func ProfileAvatarURL(name string) string {
	avatarStorageMu.RLock()
	defer avatarStorageMu.RUnlock()
	_, metaPath := avatarPaths(name)
	raw, err := os.ReadFile(metaPath)
	if err != nil {
		return ""
	}
	var meta avatarMeta
	if json.Unmarshal(raw, &meta) != nil {
		return ""
	}
	return meta.URL
}

func avatarPaths(name string) (string, string) {
	dir := profileDir(name)
	return filepath.Join(dir, "avatar"), filepath.Join(dir, "avatar.json")
}

func hasAvatar(name string) bool {
	avatarStorageMu.RLock()
	defer avatarStorageMu.RUnlock()
	rawPath, metaPath := avatarPaths(name)
	if _, err := os.Stat(rawPath); err != nil {
		return false
	}
	if _, err := os.Stat(metaPath); err != nil {
		return false
	}
	return true
}

func profileAvatarRevision(name string) string {
	data, _, ok := ProfileAvatar(name)
	if !ok {
		return ""
	}
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:8])
}

// ProfileAvatar returns raw bytes + mime when avatar exists.
func ProfileAvatar(name string) ([]byte, string, bool) {
	avatarStorageMu.RLock()
	defer avatarStorageMu.RUnlock()
	if !profileExists(name) {
		return nil, "", false
	}
	rawPath, metaPath := avatarPaths(name)
	metaRaw, err := os.ReadFile(metaPath)
	if err != nil {
		return nil, "", false
	}
	var meta avatarMeta
	if err := json.Unmarshal(metaRaw, &meta); err != nil || meta.Mime == "" || meta.URL != "" {
		return nil, "", false
	}
	data, err := os.ReadFile(rawPath)
	if err != nil {
		return nil, "", false
	}
	return data, meta.Mime, true
}

func validateAvatarData(mime string, data []byte) (string, error) {
	mime = strings.ToLower(strings.TrimSpace(mime))
	if mime == "image/jpg" {
		mime = "image/jpeg"
	}
	isGeneric := mime == "" || mime == "application/octet-stream" || mime == "binary/octet-stream"
	if !isGeneric && !allowedAvatarMimes[mime] {
		return "", fmt.Errorf("unsupported avatar type %q", mime)
	}
	if len(data) == 0 {
		return "", fmt.Errorf("avatar empty")
	}
	if len(data) > maxAvatarBytes {
		return "", fmt.Errorf("avatar too large (%d > %d)", len(data), maxAvatarBytes)
	}
	sniffed := http.DetectContentType(data)
	if !allowedAvatarMimes[sniffed] {
		return "", fmt.Errorf("avatar content type %q not allowed", sniffed)
	}
	if !isGeneric && sniffed != mime {
		return "", fmt.Errorf("mime %q does not match content %q", mime, sniffed)
	}
	return sniffed, nil
}

func writeAvatarFiles(rawPath, metaPath, mime string, data []byte) error {
	metaRaw, err := json.Marshal(avatarMeta{Mime: mime})
	if err != nil {
		return err
	}
	rawTmp, err := os.CreateTemp(filepath.Dir(rawPath), ".avatar-*")
	if err != nil {
		return err
	}
	rawTmpPath := rawTmp.Name()
	defer os.Remove(rawTmpPath)
	if _, err := rawTmp.Write(data); err != nil {
		rawTmp.Close()
		return err
	}
	if err := rawTmp.Close(); err != nil {
		return err
	}
	metaTmp, err := os.CreateTemp(filepath.Dir(metaPath), ".avatar-meta-*")
	if err != nil {
		return err
	}
	metaTmpPath := metaTmp.Name()
	defer os.Remove(metaTmpPath)
	if _, err := metaTmp.Write(metaRaw); err != nil {
		metaTmp.Close()
		return err
	}
	if err := metaTmp.Close(); err != nil {
		return err
	}
	oldRaw, oldRawErr := os.ReadFile(rawPath)
	oldMeta, oldMetaErr := os.ReadFile(metaPath)
	if err := os.Rename(rawTmpPath, rawPath); err != nil {
		return err
	}
	if err := os.Rename(metaTmpPath, metaPath); err != nil {
		if oldRawErr == nil {
			_ = os.WriteFile(rawPath, oldRaw, 0o644)
		} else {
			_ = os.Remove(rawPath)
		}
		if oldMetaErr == nil {
			_ = os.WriteFile(metaPath, oldMeta, 0o644)
		}
		return err
	}
	return nil
}

func SetProfileAvatar(name, mime string, data []byte) error {
	name = strings.TrimSpace(name)
	if name == "" || strings.Contains(name, "/") || strings.Contains(name, "..") {
		return fmt.Errorf("invalid profile name %q", name)
	}
	if !profileExists(name) {
		return fmt.Errorf("profile %q not found", name)
	}
	sniffed, err := validateAvatarData(mime, data)
	if err != nil {
		return err
	}
	dir := profileDir(name)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	rawPath, metaPath := avatarPaths(name)
	avatarStorageMu.Lock()
	defer avatarStorageMu.Unlock()
	return writeAvatarFiles(rawPath, metaPath, sniffed, data)
}

func RemoveProfileAvatar(name string) error {
	if !profileExists(name) {
		return fmt.Errorf("profile %q not found", name)
	}
	rawPath, metaPath := avatarPaths(name)
	avatarStorageMu.Lock()
	defer avatarStorageMu.Unlock()
	_ = os.Remove(rawPath)
	_ = os.Remove(metaPath)
	return nil
}

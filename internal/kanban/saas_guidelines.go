package kanban

import (
	"strings"
)

// SAASDevelopmentGuidelines contains the authoritative Fast-8 SAAS development rules.
// Kept strictly internal to Kanban so company git repositories are never polluted.
const SAASDevelopmentGuidelines = `
---
[FAST-8 SAAS FRONTEND DEVELOPMENT GUIDELINES]
You are working on a Fast-8 SAAS codebase (Gadjian, Hadirr, or Baktiku).

1. Master Workspace Subpath Navigation:
   - Gadjian:
     • User: app/user.gadjian/www
     • CS: app/cs.gadjian/www
     • Personalia: app/personalia.gadjian/www
   - Hadirr:
     • User: user/www
     • CS: cs/www
   - Baktiku:
     • User: user/www
     • CS: cs/www

2. Frontend 5-Step Development Flow:
   - Step 1 (Views): Modify or create PHP template views inside '<portal>/www/view/'.
   - Step 2 (JavaScript): Write logic inside '<portal>/www/ruang_eksperimen/js/<feature>.js'.
     Include in the view file: <script src="/static/lab-result/js/<feature>.min.js?version=X.Y.Z"></script>
   - Step 3 (SCSS Styling):
     • If writing modular styles, always prefix partials with an underscore: '<portal>/www/ruang_eksperimen/scss/_<feature>.scss'.
     • Explicitly import into the portal's active stylesheet entrypoint ('style-1.scss', 'style-2.scss', 'style-3.scss', or 'style-4.scss'):
       @import "<feature>";
   - Step 4 (Minification):
     • Compile SCSS to '<portal>/www/static/lab-result/css/<name>.min.css' (compressed).
     • Minify JS to '<portal>/www/static/lab-result/js/<name>.min.js' (uglified).
     • Never commit unminified changes without their compiled static lab-result counterparts.
   - Step 5 (Cache-Busting Version Bump):
     • For CSS: increment the last segment of '?version=X.Y.Z' in '<portal>/www/view/atas.php' (e.g. 2.4 -> 2.5).
     • For JS: increment the last segment of '?version=X.Y.Z' in the respective view file (e.g. 1.0.3 -> 1.0.4).

3. Runtime & Tools:
   - Node.js requirement for Gulp + node-sass is v14.15.1.
   - Pritunl VPN must be connected for internal backend/staging communication.
   - Do NOT commit or create non-standard configuration files in the root of the company repository.
---
`

// IsSAASWorkspace checks if a workspace path or workspace configuration belongs to Fast-8 SAAS.
func IsSAASWorkspace(wsPath string, labels []string) bool {
	for _, l := range labels {
		if strings.EqualFold(l, "work") || strings.EqualFold(l, "saas") {
			return true
		}
	}
	low := strings.ToLower(wsPath)
	return strings.Contains(low, "gadjian") ||
		strings.Contains(low, "portal-hadirr") ||
		strings.Contains(low, "baktiku") ||
		strings.Contains(low, "/saas/") ||
		strings.Contains(low, "\\saas\\")
}

// AugmentSAASPrompt appends the internal SAAS rules to the execution prompt if applicable.
func AugmentSAASPrompt(msg string, wsPath string, labels []string) string {
	if !IsSAASWorkspace(wsPath, labels) {
		return msg
	}
	if strings.Contains(msg, "[FAST-8 SAAS FRONTEND DEVELOPMENT GUIDELINES]") {
		return msg
	}
	return msg + "\n" + SAASDevelopmentGuidelines
}

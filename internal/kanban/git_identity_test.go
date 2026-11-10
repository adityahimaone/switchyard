package kanban

// CI runners have no git identity configured. Several tests in this package run
// real `git commit` against throwaway repositories, so they passed on a
// developer machine (which has a global git config) and failed on a clean
// runner with "Author identity unknown" / exit status 128.
//
// Setting the author and committer environment variables makes those tests
// hermetic without touching the host's git config, which is the property that
// matters: a test must not depend on the machine it runs on.

import "os"

func init() {
	setTestGitIdentity()
}

func setTestGitIdentity() {
	for key, value := range map[string]string{
		"GIT_AUTHOR_NAME":     "Switchyard Test",
		"GIT_AUTHOR_EMAIL":    "test@switchyard.invalid",
		"GIT_COMMITTER_NAME":  "Switchyard Test",
		"GIT_COMMITTER_EMAIL": "test@switchyard.invalid",
	} {
		if os.Getenv(key) == "" {
			_ = os.Setenv(key, value)
		}
	}
}

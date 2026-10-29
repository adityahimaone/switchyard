package main

import "testing"

func TestFirstSHASkipsProvenance(t *testing.T) {
	cases := []struct{ in, want string }{
		{"provenance executor=shell node=dsh\n9b496f4f7ba6761cbce42d5370783552721ef487\n", "9b496f4f7ba6761cbce42d5370783552721ef487"},
		{"deadbeefdeadbeefdeadbeefdeadbeefdeadbeef", "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef"},
		{"provenance executor=shell\nfatal: not a git repository", ""},
		{"", ""},
	}
	for _, c := range cases {
		if got := firstSHA(c.in); got != c.want {
			t.Fatalf("firstSHA(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}

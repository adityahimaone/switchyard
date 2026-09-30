import io

p = r"C:\Development\switchyard\web\src\App.tsx"
src = io.open(p, encoding="utf-8").read()

start = src.index('  const filterRail = page === "board" && !detailId && filtersOpen && (')
end = src.index('  const boardSwitcher = page === "board" ? (')

new = '''  const filterRail = page === "board" && !detailId && (
    <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2 md:px-6">
      <div className="relative w-full max-w-56">
        <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-ink-3" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search tasks"
          aria-label="Search tasks"
          className="pl-8"
        />
      </div>

      <FilterChip
        label="Status"
        value={fStatus}
        onChange={setFStatus}
        options={[
          { value: "__all", label: "All" },
          ...BOARD_COLUMNS.map((s) => ({ value: s, label: STATUS_LABEL[s] })),
        ]}
      />
      <FilterChip
        label="Agent"
        value={fAgent}
        onChange={setFAgent}
        options={[
          ...PROFILE_OPTIONS,
          ...(profiles.data ?? []).map((p) => ({ value: p.name, label: p.name })),
          { value: "", label: "Unassigned" },
        ]}
      />
      <FilterChip
        label="Workspace"
        value={fWorkspace}
        onChange={setFWorkspace}
        options={[
          ...WORKSPACE_OPTIONS,
          ...(workspaces.data ?? []).map((w) => ({ value: w.path, label: w.name })),
          { value: "", label: "Scratch (no path)" },
        ]}
      />
      <FilterChip
        label="Priority"
        value={fPriority}
        onChange={setFPriority}
        options={[
          { value: "__all", label: "All" },
          { value: "0", label: "P0 normal" },
          { value: "1", label: "P1" },
          { value: "2", label: "P2 high" },
          { value: "3", label: "P3 urgent" },
        ]}
      />

      <span className="tabular text-xs text-ink-3" aria-live="polite">
        {filtered.length === (tasks.data?.length ?? 0)
          ? `${tasks.data?.length ?? 0}`
          : `${filtered.length} of ${tasks.data?.length ?? 0}`}
      </span>

      {filtersActive && (
        <Button variant="ghost" size="sm" onClick={clearFilters} className="text-ink-3">
          <X className="size-3" /> Clear
        </Button>
      )}

      <div className="ml-auto flex items-center gap-2">
        <Input
          value={viewName}
          onChange={(e) => setViewName(e.target.value)}
          placeholder="View name"
          aria-label="Saved view name"
          className="h-8 w-32"
        />
        <Button variant="outline" size="sm" disabled={!viewName.trim()} onClick={saveView}>
          Save view
        </Button>
        {savedViews.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">Views</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {savedViews.map((v) => (
                <DropdownMenuItem key={v.name} onSelect={() => applyView(v.name)}>
                  {v.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  )

'''

src = src[:start] + new + src[end:]
io.open(p, "w", encoding="utf-8", newline="").write(src)
print("replaced filterRail block")

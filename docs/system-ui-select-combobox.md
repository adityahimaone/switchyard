# System UI: Select and Combobox

Use shared system components for every new form control.

## Select

Use `@/components/ui/select` for short, static option lists.

```tsx
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

<Select value={value} onValueChange={setValue}>
  <SelectTrigger size="sm" className="w-44">
    <SelectValue placeholder="Choose option" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="one">Option one</SelectItem>
  </SelectContent>
</Select>
```

## Combobox

Use `@/components/ui/combobox` when user needs search, options are numerous, or options need groups/keywords.

```tsx
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
} from "@/components/ui/combobox"

<Combobox value={value} onValueChange={setValue}>
  <ComboboxTrigger>
    <ComboboxInput aria-label="Search options" placeholder="Search…" />
  </ComboboxTrigger>
  <ComboboxContent>
    <ComboboxList ariaLabel="Options">
      <ComboboxEmpty>No options found.</ComboboxEmpty>
      {options.map((option) => (
        <ComboboxItem
          key={option.value}
          value={option.value}
          textValue={option.label}
          keywords={option.keywords}
        >
          {option.label}
        </ComboboxItem>
      ))}
    </ComboboxList>
  </ComboboxContent>
</Combobox>
```

## Rules

- Never add native `<select>` for product UI.
- Never build custom search dropdown when `Combobox` fits.
- Keep current density: `SelectTrigger` default `h-9`; use `size="sm"` intent where supported by caller styling.
- Keep labels, controlled/uncontrolled state, disabled state, empty state, and keyboard navigation.
- Use `keywords` for aliases and metadata users may search.
- Respect reduced motion. Do not add large custom trigger sizes unless screen context requires it.
- Long panels grow with content until available viewport height, then scroll inside panel content. Never force panel height to trigger height.
- Keep option rows static; avoid per-row blur, stagger, or spring animation for large model/provider lists. Use short opacity/transform feedback only.
- Keep filtering memoized through `Combobox` `filter`; use server-side filtering for very large remote datasets.
- Existing native selects are migration candidates; migrate only when touching that screen.

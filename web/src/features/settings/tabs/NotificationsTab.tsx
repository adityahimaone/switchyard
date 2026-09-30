import { Switch } from "@/components/ui/switch"
import { SettingRow, SettingsSection } from "../settings-parts"
import { useSetting } from "../useSetting"

const BROWSER_KEY = "kb-notify-browser"
const FAILURE_KEY = "kb-notify-failure"
const REVIEW_KEY = "kb-notify-review"

export default function NotificationsTab() {
  const [browser, setBrowser] = useSetting(BROWSER_KEY, false)
  const [failure, setFailure] = useSetting(FAILURE_KEY, true)
  const [review, setReview] = useSetting(REVIEW_KEY, true)

  return (
    <SettingsSection
      title="Notifications"
      description="What the app tells you about, and where."
    >
      <SettingRow
        label="Browser notifications"
        help="Show a system notification when something needs your attention."
        htmlFor="set-notify-browser"
      >
        <Switch
          id="set-notify-browser"
          checked={browser}
          onCheckedChange={setBrowser}
        />
      </SettingRow>
      <SettingRow
        label="Task failures"
        help="Tell me when a task fails or needs another attempt."
        htmlFor="set-notify-failure"
      >
        <Switch id="set-notify-failure" checked={failure} onCheckedChange={setFailure} />
      </SettingRow>
      <SettingRow
        label="Ready for review"
        help="Tell me when a task reaches the review gate."
        htmlFor="set-notify-review"
      >
        <Switch id="set-notify-review" checked={review} onCheckedChange={setReview} />
      </SettingRow>
    </SettingsSection>
  )
}

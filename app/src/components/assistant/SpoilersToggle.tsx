// The spoilers switch (v4.13).
//
// It sits in the header, next to the new-thread button: the reader
// decides once, and the answer is allowed to say what happens later in
// the book. It is off by default — an answer about a book you are
// halfway through must not give away the end.
import { Switch } from "@/components/ui/switch";

interface Props {
  on: boolean;
  onChange: (v: boolean) => void;
}

export default function SpoilersToggle({ on, onChange }: Props) {
  return (
    <label className="chat-toggle" data-on={on ? "true" : "false"}>
      <span className="chat-toggle-label">Spoilers</span>
      <Switch
        checked={on}
        onCheckedChange={onChange}
        aria-label="Allow spoilers"
        data-testid="assistant-spoilers"
        size="sm"
      />
    </label>
  );
}

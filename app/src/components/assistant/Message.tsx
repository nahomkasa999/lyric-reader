// One message of the conversation (v4.13).
//
// The reader's question is a bubble on the right; the answer is plain
// text on the left, with no bubble at all — the way the reference
// reads. The sources hang under the answer.
import type { AssistantMessage } from "../../lib/assistantStore";
import Markdown from "./Markdown";
import Sources from "./Sources";

interface Props {
  message: AssistantMessage;
  onJump: (bookId: string, item: number) => void;
  /** the answer is still coming in */
  streaming?: boolean;
}

export default function Message({ message, onJump, streaming }: Props) {
  if (message.role === "user") {
    return (
      <div data-testid="assistant-question" className="chat-user">
        {message.text}
      </div>
    );
  }
  return (
    <div data-testid="assistant-answer" className="chat-ai">
      <Markdown text={message.text} />
      {streaming && <span className="chat-caret" aria-hidden />}
      <Sources sources={message.sources ?? []} onJump={onJump} />
    </div>
  );
}

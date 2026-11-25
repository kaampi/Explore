import { act, useEffect } from "react";
import type {
  AssistClose,
  AssistPanelProps,
  AssistPreview,
  OpenAssist,
  RenderAssist,
} from "../../src/ui/studio/assistContract";

/**
 * A stand-in for the AI help panel, for tests only. It sends the previews and closes the way a test
 * tells it to, and keeps what it was asked to open. The real panel is built against the same
 * contract (`assistContract.ts`).
 */
export function createFakeAssist() {
  const state = {
    opened: [] as OpenAssist[],
    props: null as AssistPanelProps | null,
    mounted: 0,
    unmounted: 0,
  };
  function Panel({ props }: { props: AssistPanelProps }) {
    state.props = props;
    useEffect(() => {
      state.opened.push(props.request);
      state.mounted++;
      return () => {
        state.unmounted++;
      };
      // Once for each opening: that is what the contract promises, so that is what is counted.
    }, []);
    return (
      <div data-fake-panel>
        <p>Fake panel: {props.request.intent}</p>
      </div>
    );
  }
  const renderAssist: RenderAssist = (props) => <Panel props={props} />;
  return {
    state,
    renderAssist,
    /** What the panel does while the author chooses. */
    async preview(next: AssistPreview) {
      await act(async () => state.props!.onPreview(next));
    },
    /** The panel is closed, with or without having saved. */
    async close(result: AssistClose) {
      await act(async () => state.props!.onClose(result));
    },
  };
}

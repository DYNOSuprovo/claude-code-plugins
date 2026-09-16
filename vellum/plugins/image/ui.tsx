import { docUrl } from "../../ui/api.ts";
import type { RendererProps, UiPlugin } from "../index.ts";

function ImageDoc(props: RendererProps): preact.JSX.Element {
  return (
    <div class="image">
      <img alt={props.doc.path} src={docUrl(props.doc)} />
    </div>
  );
}

export const imageUi: UiPlugin = {
  id: "image",
  renderers: [{ accepts: (doc) => doc.mediaType.startsWith("image/"), component: ImageDoc }],
};

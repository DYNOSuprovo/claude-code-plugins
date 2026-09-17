import { docUrl } from "../../core/page/api.ts";
import type { RendererProps, PageExtension } from "../page.ts";

function ImageDoc(props: RendererProps): preact.JSX.Element {
  return (
    <div class="image">
      <img alt={props.doc.path} src={docUrl(props.doc)} />
    </div>
  );
}

export const imagePage: PageExtension = {
  id: "image",
  renderers: [{ accepts: (doc) => doc.mediaType.startsWith("image/"), component: ImageDoc }],
};

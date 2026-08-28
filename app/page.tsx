import { Editor } from "@/features/editor/Editor";
import { fixtureDocument } from "@/features/editor/fixture";

export default function Home() {
  return <Editor initialDocument={fixtureDocument} />;
}

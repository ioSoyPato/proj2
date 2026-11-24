import { BlockMath, InlineMath } from "react-katex";

export function Eq({ children }: { children: string }) {
  return <div style={{ margin: "0.9em 0", maxWidth: "100%" }}><BlockMath math={children} /></div>;
}
export function M({ children }: { children: string }) {
  return <InlineMath math={children} />;
}

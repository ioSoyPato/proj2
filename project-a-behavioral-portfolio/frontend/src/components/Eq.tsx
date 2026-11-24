import { BlockMath, InlineMath } from "react-katex";

export function Eq({ children }: { children: string }) {
  return (
    <div className="eq">
      <BlockMath math={children} />
    </div>
  );
}

export function M({ children }: { children: string }) {
  return <InlineMath math={children} />;
}

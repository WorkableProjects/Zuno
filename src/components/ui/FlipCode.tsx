/** A room code whose characters flip in one after another. Screen readers get the code once, spaced out. */
export function FlipCode({ code, className = "hb-code" }: { code: string; className?: string }) {
  return (
    <p className={`${className} flip-code`} aria-label={`Room code ${code.split("").join(" ")}`} key={code}>
      {code.split("").map((ch, i) => (
        <span key={i} className="flip-char" style={{ "--i": i } as React.CSSProperties} aria-hidden="true">
          {ch}
        </span>
      ))}
    </p>
  );
}

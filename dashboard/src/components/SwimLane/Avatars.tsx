interface AvatarsProps { people: string[]; size?: number }

/** Overlapping emoji avatars (−0.34em per extra). */
export function Avatars({ people, size = 15 }: AvatarsProps) {
  return (
    <span style={{ fontSize: size, display: 'inline-flex', alignItems: 'center', lineHeight: 1 }}>
      {people.map((p, i) => (
        <span key={i} style={{ marginLeft: i === 0 ? 0 : -size * 0.34, lineHeight: 1 }}>{p}</span>
      ))}
    </span>
  );
}

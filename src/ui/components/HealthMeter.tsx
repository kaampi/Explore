export function HealthMeter({ name, value, max }: { name: string; value: number; max: number }) {
  const condition = value === 0 ? 'Incapacitated' : value <= max * .25 ? 'Badly injured' : value < max ? 'Injured' : 'Unhurt';
  return <div className="gate-health" data-condition={value === 0 ? 'down' : value <= max * .25 ? 'critical' : value < max ? 'injured' : 'healthy'}>
    <div className="gate-health__label"><strong>{name}</strong><span>{value} / {max}</span></div>
    <progress aria-label={`${name} health`} value={value} max={max} />
    <small>{condition}</small>
  </div>;
}

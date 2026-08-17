import { useStore } from '../store';
import { C } from '../selectors';
import type { Sensor } from '../types';

function sensorColors(s: Sensor) {
  const statusColor = s.status === 'ON STATION' ? C.green : s.status === 'TASKED' ? C.amber : s.status === 'DEGRADED' ? C.red : C.dim;
  const endColor = s.endur > 60 ? C.green : s.endur > 35 ? C.amber : C.red;
  const taskColor = s.status === 'DEGRADED' ? C.red : '#9fb2ae';
  const border = s.status === 'DEGRADED' ? '#3a2422' : 'var(--hairline-subtle)';
  return { statusColor, endColor, taskColor, border };
}

function SensorCard({ s }: { s: Sensor }) {
  const retaskSensor = useStore((st) => st.retaskSensor);
  const { statusColor, endColor, taskColor, border } = sensorColors(s);

  return (
    <div onClick={() => retaskSensor(s.id)} style={{ border: `1px solid ${border}`, background: 'var(--panel-3)', padding: '8px 9px', cursor: 'pointer', position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: statusColor, boxShadow: `0 0 6px ${statusColor}`, flexShrink: 0 }} />
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 600, letterSpacing: '.06em', color: 'var(--ink-bright)' }}>{s.callsign}</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 8.5, letterSpacing: '.1em', color: statusColor, fontWeight: 600 }}>{s.status}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5 }}>
        <span style={{ fontSize: 9.5, color: 'var(--ink-mute2)' }}>{s.platform}</span>
        <span style={{ width: 3, height: 3, borderRadius: '50%', background: '#3a4a47' }} />
        <span style={{ fontSize: 9.5, color: 'var(--ink-dim2)' }}>{s.intType}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
        <span style={{ fontSize: 8.5, letterSpacing: '.1em', color: 'var(--ink-faint)' }}>TASK</span>
        <span style={{ fontSize: 9.5, color: taskColor, fontWeight: 500 }}>{s.tasking}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
        <span style={{ fontSize: 8, letterSpacing: '.1em', color: 'var(--ink-faint)' }}>END</span>
        <div style={{ flex: 1, height: 3, background: 'var(--hairline-subtle2)', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${s.endur}%`, background: endColor }} />
        </div>
        <span style={{ fontSize: 8.5, color: 'var(--ink-dim2)', fontVariantNumeric: 'tabular-nums' }}>{s.endur}%</span>
      </div>
    </div>
  );
}

export default function LeftRail() {
  const sensors = useStore((s) => s.sensors);
  const nais = useStore((s) => s.nais);
  const sensorsOn = sensors.filter((s) => s.status === 'ON STATION' || s.status === 'TASKED').length;

  return (
    <div style={{ borderRight: '1px solid var(--hairline)', background: 'var(--panel-1)', display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: '1px solid var(--hairline)', background: 'linear-gradient(180deg,#0d1416,#0a0f10)' }}>
        <span style={{ width: 5, height: 14, background: 'var(--cyan)', boxShadow: '0 0 8px var(--cyan)' }} />
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: '.2em', color: 'var(--cyan)', fontWeight: 600 }}>ISR · COLLECTION</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 9, color: 'var(--ink-faint)', letterSpacing: '.1em' }}>
          {sensorsOn}/{sensors.length} ON STN
        </span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontSize: 9, letterSpacing: '.18em', color: 'var(--ink-faint)', padding: '0 2px' }}>SENSOR LAYDOWN</div>
        {sensors.map((s) => (
          <SensorCard key={s.id} s={s} />
        ))}

        <div style={{ fontSize: 9, letterSpacing: '.18em', color: 'var(--ink-faint)', padding: '6px 2px 0' }}>NAMED AREAS OF INTEREST</div>
        {nais.map((n) => (
          <div key={n.id} style={{ border: '1px solid var(--hairline-mid)', borderLeft: `2px solid ${n.color}`, background: 'var(--panel-3)', padding: '7px 9px', display: 'flex', alignItems: 'center', gap: 9 }}>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 600, letterSpacing: '.08em', color: n.color }}>{n.id}</span>
            <span style={{ fontSize: 9.5, color: 'var(--ink-mute2)', flex: 1 }}>{n.desc}</span>
            <span style={{ fontSize: 8.5, letterSpacing: '.1em', color: 'var(--ink-faint)' }}>{n.pir}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

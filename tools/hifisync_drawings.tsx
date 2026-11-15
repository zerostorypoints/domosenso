import { useMemo, useState } from 'react';
import { DrawingLocale } from 'next-intl';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { RackView } from './app/_components/scorecard/RackView';
import { RoomIsometric } from './app/_components/scorecard/RoomIsometric';

type Drawing = {
  rackKind: 'amp' | 'phono' | 'tt' | 'src' | 'spk' | 'sub' | 'dac';
  widthCm?: number;
  heightCm?: number;
  floorstanding?: boolean;
  drivers?: { role: string; size: number; count: number; type?: string; face?: string }[];
  bassAlignment?: string;
  active?: boolean;
};
type Component = { id: string; label: string; role: string; quantity: number; drawing?: Drawing };
type System = { components: Component[]; rack: string[][] };
type Placement = { role: string; xM: number; yM: number; rotationDeg: number | null };
type Room = { widthM: number; lengthM: number; heightM: number | null; placements: Placement[] };
type Locale = 'en' | 'de' | 'pl';
type Translate = (key: string) => string;

function Equipment({ system, translate }: { system: System; translate: Translate }) {
  const rack = useMemo(() => system.components.flatMap(component => {
    const d = component.drawing;
    if (!d?.widthCm || !d.heightCm) return [];
    return [{ id: component.id, kind: d.rackKind, brand: '', model: component.label,
      role: component.role, w_cm: d.widthCm, h_cm: d.heightCm, floorish: d.floorstanding === true,
      hasDims: true, features: [], usedIn: 0, count: component.quantity, href: '',
      drivers: d.drivers, bass: d.bassAlignment, active: d.active }];
  }), [system.components]);
  const [selected, select] = useState(() => rack.find(unit => unit.kind === 'amp')?.id ?? rack[0]?.id);
  const shelves = system.rack.length ? system.rack : undefined;
  return <>
    <RackView rack={rack} shelves={shelves} selected={selected} onSelect={select}/>
    <div className="hifisync-equipment">
      {system.components.map(component => {
        const shown = rack.some(unit => unit.id === component.id);
        const role = ['amplifier','source','speaker','subwoofer','dac'].includes(component.role) ? component.role : 'other';
        return <button key={component.id} type="button" disabled={!shown}
          aria-pressed={shown ? selected === component.id : undefined} onClick={() => select(component.id)}>
          <small>{translate('hifi-role-' + role)}</small>
          <strong>{component.label}</strong>
        </button>;
      })}
    </div>
  </>;
}

function ListeningRoom({ room, translate }: { room: Room; translate: Translate }) {
  const toDrawingPoint = (point: Placement) => ({
    x: point.xM, y: point.yM, rotation: point.rotationDeg ?? 0,
  });
  const speakers = room.placements.filter(point => point.role === 'left' || point.role === 'right');
  const listener = room.placements.find(point => point.role === 'listening');
  return <RoomIsometric heightM={room.heightM ?? 2.5} real studio={{
    planOnly: room.heightM === null,
    speakers: speakers.map(point => ({
      name: translate('hifi-position-' + point.role), rotationDeg: point.rotationDeg,
    })),
  }} geometry={{
    width: room.widthM, length: room.lengthM, speakers: speakers.map(toDrawingPoint),
    subs: room.placements.filter(point => point.role === 'subwoofer').map(toDrawingPoint),
    listener: listener ? toDrawingPoint(listener) : null,
  }}/>;
}

export function mountHiFiDrawing(host: HTMLElement, type: string, model: System | Room, locale: Locale, translate: Translate) {
  const root = createRoot(host);
  flushSync(() => root.render(<DrawingLocale.Provider value={locale}>{type === 'system'
    ? <Equipment system={model as System} translate={translate}/>
    : <ListeningRoom room={model as Room} translate={translate}/>}</DrawingLocale.Provider>));
  return () => root.unmount();
}

import type { ComponentChild } from 'preact';

/** What a prototype's `render` gets: the step of the tour (1 based) and a way to move to another. */
export interface ProtoProps {
  step: number;
  setStep(step: number): void;
}

/** A prototype: a clickable concept, registered by its own folder (`valley/`, `party/`). */
export interface Prototype {
  /** The address part: `prototype.html#<id>`. */
  id: string;
  title: string;
  /** Usually `TOUR_STEPS` mapped to `{ id, title }`. */
  steps: readonly { id: string; title: string }[];
  render(props: ProtoProps): ComponentChild;
}

const protos = new Map<string, Prototype>();

/** Registers a prototype (call it once, at the top level of the prototype's `index.tsx`). */
export function registerProto(proto: Prototype): void {
  protos.set(proto.id, proto);
}

export function getProto(id: string): Prototype | undefined {
  return protos.get(id);
}

/** The prototypes in the order they registered. */
export function listProtos(): Prototype[] {
  return [...protos.values()];
}

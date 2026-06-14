/**
 * Drives G-code simulation playback: it answers one question each frame —
 * "how far along the toolpath is the pen right now?" — and hands back a
 * fractional progress in [0,1] plus play/pause/seek/speed controls.
 *
 * It is intentionally geometry-agnostic: it walks the cumulative LENGTH of the
 * moves (so the pen travels at a believable, constant visual speed regardless
 * of how the points are spaced) and exposes the interpolated tip position. The
 * GCodeVisualizer reads `progress`/`tip` and renders; this hook owns no canvas.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GMove } from "./types";

export interface SimTip {
  x: number;
  y: number;
  /** true when the pen is down (drawing) at this instant. */
  drawing: boolean;
}

export interface SimPlayer {
  playing: boolean;
  /** Playback position in [0,1] over total path length. */
  progress: number;
  /** Speed multiplier (1 = base). */
  speed: number;
  /** Interpolated pen-tip position, or null before anything is drawn. */
  tip: SimTip | null;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  restart: () => void;
  /** Seek to a fraction in [0,1] (pauses implicitly handled by caller). */
  seek: (fraction: number) => void;
  setSpeed: (mult: number) => void;
}

/** Cumulative XY length up to each move, used to map progress -> position. */
interface PathMetric {
  /** cumulative[i] = total drawn+travel length up to move i. */
  cumulative: number[];
  total: number;
}

function computeMetric(moves: GMove[]): PathMetric {
  const cumulative = new Array<number>(moves.length).fill(0);
  let total = 0;
  let prev: GMove | null = null;
  for (let i = 0; i < moves.length; i++) {
    const m = moves[i];
    if (
      prev &&
      Number.isFinite(prev.x) &&
      Number.isFinite(prev.y) &&
      Number.isFinite(m.x) &&
      Number.isFinite(m.y) &&
      !m.zOnly
    ) {
      total += Math.hypot(m.x - prev.x, m.y - prev.y);
    }
    cumulative[i] = total;
    prev = m.zOnly ? prev : m;
  }
  return { cumulative, total };
}

/** Base traversal speed in mm per second of wall-clock at speed multiplier 1. */
const BASE_SPEED_MM_PER_S = 120;

export function useSimPlayer(moves: GMove[]): SimPlayer {
  const metric = useMemo(() => computeMetric(moves), [moves]);

  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [speed, setSpeed] = useState(1);

  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);
  // Mirror live values into refs so the rAF loop reads fresh data without
  // re-subscribing every frame.
  const progressRef = useRef(0);
  const speedRef = useRef(1);
  progressRef.current = progress;
  speedRef.current = speed;

  // A new toolpath shows the FULL drawing by default (progress = 1, paused), so
  // the user always sees the complete result first. Pressing Play/Restart then
  // rewinds to the start and animates the pen (handled in play/toggle/restart).
  useEffect(() => {
    setPlaying(false);
    setProgress(1);
    progressRef.current = 1;
    lastTsRef.current = null;
  }, [metric]);

  useEffect(() => {
    if (!playing || metric.total <= 0) return;

    const tick = (ts: number) => {
      const last = lastTsRef.current;
      lastTsRef.current = ts;
      if (last != null) {
        const dt = (ts - last) / 1000;
        const advanced =
          (dt * BASE_SPEED_MM_PER_S * speedRef.current) / metric.total;
        let next = progressRef.current + advanced;
        if (next >= 1) {
          next = 1;
          setProgress(1);
          setPlaying(false);
          return;
        }
        setProgress(next);
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      lastTsRef.current = null;
    };
  }, [playing, metric]);

  const play = useCallback(() => {
    // Replaying from the end starts over.
    if (progressRef.current >= 1) setProgress(0);
    lastTsRef.current = null;
    setPlaying(true);
  }, []);
  const pause = useCallback(() => setPlaying(false), []);
  const toggle = useCallback(() => {
    setPlaying((p) => {
      if (!p && progressRef.current >= 1) setProgress(0);
      lastTsRef.current = null;
      return !p;
    });
  }, []);
  const restart = useCallback(() => {
    setProgress(0);
    lastTsRef.current = null;
    setPlaying(true);
  }, []);
  const seek = useCallback((fraction: number) => {
    const f = Math.min(1, Math.max(0, fraction));
    setProgress(f);
    progressRef.current = f;
  }, []);

  // Map progress -> interpolated tip position along the cumulative length.
  const tip = useMemo<SimTip | null>(() => {
    if (metric.total <= 0 || moves.length === 0) return null;
    const targetLen = progress * metric.total;

    let prev: GMove | null = null;
    for (let i = 0; i < moves.length; i++) {
      const m = moves[i];
      const segEnd = metric.cumulative[i];
      if (!m.zOnly && prev && segEnd >= targetLen) {
        const segStart = prev ? metric.cumulative[i - 1] ?? 0 : 0;
        const segLen = segEnd - segStart;
        const t = segLen > 0 ? (targetLen - segStart) / segLen : 1;
        return {
          x: prev.x + (m.x - prev.x) * t,
          y: prev.y + (m.y - prev.y) * t,
          drawing: !m.rapid,
        };
      }
      if (!m.zOnly) prev = m;
    }
    // Past the end: rest at the last drawn point.
    const lastDrawn = [...moves].reverse().find((m) => !m.zOnly);
    return lastDrawn
      ? { x: lastDrawn.x, y: lastDrawn.y, drawing: false }
      : null;
  }, [progress, metric, moves]);

  return {
    playing,
    progress,
    speed,
    tip,
    play,
    pause,
    toggle,
    restart,
    seek,
    setSpeed,
  };
}

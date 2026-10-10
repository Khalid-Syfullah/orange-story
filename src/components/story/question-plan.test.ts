import { afterEach, describe, expect, it } from "vitest";

import { createCameraPath, projectPoint, setStageAspect } from "@/components/stage/camera-path";
import { BEATS, CAMERA, FAQ, SCENES } from "@/scroll/script";

import {
  activeCard,
  anchorOnScreen,
  ARC,
  cardCorner,
  cardFit,
  cardPose,
  CARD_REST,
  FIT,
  connectorFrame,
  DECK,
  deckNear,
  lineAngle,
  onStage,
  OPPOSITE,
  ZOOM,
  type Size,
} from "./question-plan";

/** A desktop stage and a question card laid out on it (34rem wide, about two lines of answer). */
const STAGE: Size = { width: 1440, height: 900 };
const CARD: Size = { width: 544, height: 214 };
const SIZES: readonly Size[] = DECK.map(() => CARD);

const faq = SCENES.find((s) => s.id === "faq")!;
const steps = (a: number, b: number, n = 120) => Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n);
const midHold = (i: number) => (DECK[i].def.hold[0] + DECK[i].def.hold[1]) / 2;

describe("the question deck", () => {
  it("is the five question beats in order, abutting, inside the questions scene", () => {
    expect(DECK.map((c) => c.beat)).toEqual(["question-1", "question-2", "question-3", "question-4", "question-5"]);
    expect(DECK.map((c) => c.def)).toEqual(BEATS.filter((b) => b.id.startsWith("question-")));
    for (let i = 0; i < DECK.length; i++) {
      const { def } = DECK[i];
      expect(def.in).toBeGreaterThanOrEqual(faq.start);
      expect(def.out).toBeLessThanOrEqual(faq.end);
      if (i > 0) expect(def.in).toBe(DECK[i - 1].def.out);
    }
    expect(DECK[0].arrive).toBe("zoom");
    expect(DECK.slice(1).every((c) => c.arrive === "arc")).toBe(true);
    expect(DECK.slice(0, -1).every((c) => c.def.leave === "swing-left")).toBe(true);
    expect(DECK[DECK.length - 1].def.leave).toBe("smoke");
  });

  it("anchors on a different orange each time, alternating rows, and on a different corner than the card before", () => {
    const rows = DECK.map((c) => (c.anchor.plate.includes("left") ? "left" : "right"));
    expect(rows).toEqual(["left", "right", "left", "right", "left"]);
    expect(new Set(DECK.map((c) => `${c.anchor.plate}#${c.anchor.point}`)).size).toBe(DECK.length);
    for (let i = 1; i < DECK.length; i++) expect(DECK[i].corner).not.toBe(DECK[i - 1].corner);
    // The line leaves the card on the side of its orange's row.
    for (const card of DECK) expect(card.corner.endsWith(card.anchor.plate.includes("left") ? "left" : "right")).toBe(true);
    // Every corner is used, and the sparkles sit across from the line.
    expect(new Set(DECK.map((c) => c.corner)).size).toBe(4);
    for (const card of DECK) expect(card.sparkles).toBe(OPPOSITE[card.corner]);
  });

  it("mounts the deck just before the first card and keeps it to just after the last", () => {
    expect(deckNear(DECK[0].def.in)).toBe(true);
    expect(deckNear(DECK[DECK.length - 1].def.out)).toBe(true);
    expect(deckNear(faq.start - 0.05)).toBe(false);
    expect(deckNear(0.9)).toBe(false);
  });
});

describe("card poses", () => {
  it("zooms the first card up from small in the center, arriving from below", () => {
    const { def } = DECK[0];
    const start = cardPose(0, def.in, STAGE);
    expect(start.shown).toBe(true);
    expect(start.opacity).toBe(0);
    expect(start.scale).toBeCloseTo(ZOOM.scale, 9);
    let prevScale = 0;
    for (const p of steps(def.in, def.hold[0])) {
      const pose = cardPose(0, p, STAGE);
      expect(pose.x).toBe(0);
      expect(pose.y).toBeGreaterThanOrEqual(0);
      expect(pose.scale).toBeGreaterThanOrEqual(prevScale - 1e-12);
      prevScale = pose.scale;
    }
    expect(cardPose(0, def.hold[0], STAGE)).toMatchObject({ x: 0, y: 0, scale: 1, rotate: 0, opacity: 1, blur: 0 });
  });

  it("brings the next cards in from the right into the center", () => {
    for (const card of DECK.slice(1)) {
      const { def } = card;
      let prevX = Infinity;
      for (const p of steps(def.in, def.hold[0])) {
        const pose = cardPose(card.index, p, STAGE);
        expect(pose.x).toBeGreaterThanOrEqual(-1e-9);
        expect(pose.x).toBeLessThanOrEqual(prevX + 1e-9);
        prevX = pose.x;
      }
      const first = cardPose(card.index, def.in, STAGE);
      expect(first.x).toBeCloseTo(ARC.reach * STAGE.width, 6);
      expect(first.opacity).toBe(0);
      expect(cardPose(card.index, def.hold[0], STAGE)).toMatchObject({ x: 0, scale: 1, opacity: 1, blur: 0 });
    }
  });

  it("swings a leaving card left along a curve, shrinking, blurring and fading", () => {
    for (const card of DECK.slice(0, -1)) {
      const { def } = card;
      let prev = cardPose(card.index, def.hold[1], STAGE);
      expect(prev).toMatchObject({ x: 0, y: 0, scale: 1, opacity: 1 });
      for (const p of steps(def.hold[1], def.out).slice(1, -1)) {
        const pose = cardPose(card.index, p, STAGE);
        expect(pose.x).toBeLessThanOrEqual(prev.x + 1e-9);
        expect(pose.y).toBeGreaterThanOrEqual(prev.y - 1e-9); // sinks along the rim
        expect(pose.scale).toBeLessThanOrEqual(prev.scale + 1e-9);
        expect(pose.blur).toBeGreaterThanOrEqual(prev.blur - 1e-9);
        expect(pose.opacity).toBeLessThanOrEqual(prev.opacity + 1e-9);
        expect(pose.rotate).toBeLessThanOrEqual(0);
        prev = pose;
      }
      // Along a curve, not a straight line: the middle of the swing sits above the chord.
      const mid = cardPose(card.index, (def.hold[1] + def.out) / 2, STAGE);
      const end = { x: -ARC.reach * STAGE.width, y: ARC.dip * STAGE.height };
      expect(mid.y).toBeLessThan((mid.x / end.x) * end.y);
      expect(cardPose(card.index, def.out, STAGE).shown).toBe(false);
    }
  });

  it("lets a swinging card leave as one piece: its rows only stagger in", () => {
    for (const card of DECK) {
      expect(card.rows.in).toBe(card.def.in);
      expect(card.rows.hold).toEqual(card.def.hold);
      expect(card.rows.leave).toBe(card.def.leave === "swing-left" ? "hold" : "smoke");
    }
  });

  it("lets the last card rise and dissolve in place", () => {
    const { def, index } = DECK[DECK.length - 1];
    const mid = cardPose(index, (def.hold[1] + def.out) / 2, STAGE);
    expect(mid.x).toBe(0);
    expect(mid.y).toBeLessThan(0);
    expect(mid.opacity).toBeLessThan(1);
    expect(mid.blur).toBeGreaterThan(0);
  });

  it("hands over without a pause: as one card has swung away the next starts to arrive", () => {
    for (let i = 1; i < DECK.length; i++) {
      const p = DECK[i].def.in;
      expect(cardPose(i - 1, p - 1e-9, STAGE).opacity).toBeLessThan(1e-3);
      expect(cardPose(i - 1, p, STAGE).shown).toBe(false);
      expect(cardPose(i, p, STAGE)).toMatchObject({ shown: true, opacity: 0 });
      expect(activeCard(p)).toBe(i);
    }
    expect(activeCard(faq.start)).toBe(-1);
  });

  it("is a pure function of progress: the same pose going back", () => {
    const p = midHold(2) + 0.004;
    const a = cardPose(2, p, STAGE);
    cardPose(2, 0.7, STAGE);
    cardPose(4, 0.75, STAGE);
    expect(cardPose(2, p, STAGE)).toEqual(a);
    const frame = connectorFrame(p, STAGE, SIZES);
    connectorFrame(0.75, STAGE, SIZES);
    expect(connectorFrame(p, STAGE, SIZES)).toEqual(frame);
  });

  it("finds a card's corners where its pose puts them", () => {
    const rest = cardPose(0, midHold(0), STAGE);
    const center = [CARD_REST.x * STAGE.width, CARD_REST.y * STAGE.height];
    expect(cardCorner(rest, CARD, "top-left", STAGE)).toEqual([center[0] - CARD.width / 2, center[1] - CARD.height / 2]);
    expect(cardCorner(rest, CARD, "bottom-right", STAGE)).toEqual([center[0] + CARD.width / 2, center[1] + CARD.height / 2]);
    // Turned clockwise by 90 degrees, the top-left corner swings to the top-right of the center.
    const turned = { ...rest, rotate: 90 };
    const [x, y] = cardCorner(turned, CARD, "top-left", STAGE);
    expect(x).toBeCloseTo(center[0] + CARD.height / 2, 6);
    expect(y).toBeCloseTo(center[1] - CARD.width / 2, 6);
  });
});

describe("the connector", () => {
  it("is fixed on the card's orange: the plate point seen through the stage camera", () => {
    const path = createCameraPath(CAMERA);
    for (const card of DECK) {
      for (const p of steps(card.def.in, card.def.out, 12).slice(0, -1)) {
        const expected = projectPoint(path.seek(p), card.world, STAGE.width, STAGE.height);
        const frame = connectorFrame(p, STAGE, SIZES);
        if (!frame) continue;
        expect(frame.card).toBe(card.index);
        expect(frame.anchor[0]).toBeCloseTo(expected.x, 6);
        expect(frame.anchor[1]).toBeCloseTo(expected.y, 6);
      }
    }
    path.kill();
  });

  it("anchors in the left and right rows of trees, and holds still while its card is read", () => {
    for (const card of DECK) {
      const left = card.anchor.plate.includes("left");
      const a = anchorOnScreen(card.index, card.def.hold[0], STAGE);
      const b = anchorOnScreen(card.index, card.def.hold[1], STAGE);
      expect(left ? a.x < STAGE.width * 0.3 : a.x > STAGE.width * 0.7).toBe(true);
      expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(24);
      expect(onStage(a, STAGE)).toBe(1);
    }
  });

  it("runs at about 45 degrees while each card is read", () => {
    for (const card of DECK) {
      for (const p of steps(card.def.hold[0], card.def.hold[1], 6)) {
        const frame = connectorFrame(p, STAGE, SIZES)!;
        expect(lineAngle(frame), `${card.beat} at ${p}`).toBeGreaterThan(36);
        expect(lineAngle(frame), `${card.beat} at ${p}`).toBeLessThan(54);
        // From the corner, the line heads out away from the card, toward its orange.
        const outX = card.corner.endsWith("left") ? -1 : 1;
        const outY = card.corner.startsWith("top") ? -1 : 1;
        expect(Math.sign(frame.anchor[0] - frame.corner[0])).toBe(outX);
        expect(Math.sign(frame.anchor[1] - frame.corner[1])).toBe(outY);
      }
    }
  });

  it("keeps about 45 degrees on other screens: the cards scale with the stage height, as the orchard does", () => {
    const stages: Size[] = [
      { width: 1280, height: 720 },
      { width: 1280, height: 800 },
      { width: 1536, height: 864 },
      { width: 1920, height: 1080 },
      { width: 2560, height: 1080 },
      { width: 2560, height: 1440 },
    ];
    for (const stage of stages) {
      expect(cardFit(stage)).toBeGreaterThanOrEqual(FIT.min);
      expect(cardFit(stage)).toBeLessThanOrEqual(FIT.max);
      for (const card of DECK) {
        const frame = connectorFrame(midHold(card.index), stage, SIZES)!;
        expect(lineAngle(frame), `${card.beat} on ${stage.width}x${stage.height}`).toBeGreaterThan(36);
        expect(lineAngle(frame), `${card.beat} on ${stage.width}x${stage.height}`).toBeLessThan(54);
      }
    }
    expect(cardPose(0, midHold(0), { width: 1920, height: 1080 }).scale).toBeCloseTo(1.2, 9);
  });

  describe("on a phone", () => {
    afterEach(() => setStageAspect(0));

    // The cards are two thirds of the screen wide (`STACKED_CARD`), about three lines of title and answer tall.
    const PHONES: readonly Size[] = [
      { width: 390, height: 844 },
      { width: 360, height: 740 },
      { width: 430, height: 932 },
      { width: 375, height: 667 },
    ];
    const cardOn = (stage: Size): Size => ({ width: stage.width * 0.66, height: 300 });

    it("keeps every orange on the screen: the camera widens to show the orchard rows", () => {
      for (const stage of PHONES) {
        setStageAspect(stage.width / stage.height);
        for (const card of DECK) {
          const anchor = anchorOnScreen(card.index, midHold(card.index), stage);
          expect(onStage(anchor, stage), `${card.beat} on ${stage.width}x${stage.height}`).toBe(1);
        }
      }
    });

    it("runs a short line from the orange to the card's near corner", () => {
      for (const stage of PHONES) {
        setStageAspect(stage.width / stage.height);
        const sizes = DECK.map(() => cardOn(stage));
        for (const card of DECK) {
          const frame = connectorFrame(midHold(card.index), stage, sizes)!;
          expect(frame.opacity, `${card.beat} on ${stage.width}x${stage.height}`).toBe(1);
          const length = Math.hypot(frame.anchor[0] - frame.corner[0], frame.anchor[1] - frame.corner[1]);
          expect(length, `${card.beat} length`).toBeGreaterThan(24);
          expect(length, `${card.beat} length`).toBeLessThan(stage.width / 2);
          // Steeper than on a wide screen (the oranges sit close to the card's side), but never flat along the card.
          expect(lineAngle(frame), `${card.beat} angle`).toBeGreaterThan(25);
          // The orange is on the same side of the screen as the corner it connects to.
          const side = card.corner.endsWith("left") ? -1 : 1;
          expect(Math.sign(frame.anchor[0] - frame.corner[0]), `${card.beat} side`).toBe(side);
        }
      }
    });

    it("is the same camera for everyone who asks: the line's end sits on the projected orange", () => {
      const stage = PHONES[0];
      setStageAspect(stage.width / stage.height);
      const path = createCameraPath(CAMERA);
      for (const card of DECK) {
        const p = midHold(card.index);
        const frame = connectorFrame(p, stage, DECK.map(() => cardOn(stage)))!;
        const direct = projectPoint(path.seek(p), card.world, stage.width, stage.height);
        expect(frame.anchor[0]).toBeCloseTo(direct.x, 6);
        expect(frame.anchor[1]).toBeCloseTo(direct.y, 6);
      }
      path.kill();
    });
  });

  it("draws out from the orange as the card arrives, then locks its square to the corner", () => {
    for (const card of DECK) {
      const before = connectorFrame(card.draw[0], STAGE, SIZES)!;
      expect(before.draw).toBe(0);
      expect(before.lock).toBe(0);
      expect(before.end).toEqual(before.anchor);
      const drawn = connectorFrame(card.draw[1], STAGE, SIZES)!;
      expect(drawn.draw).toBe(1);
      expect(drawn.lock).toBe(1);
      expect(drawn.end[0]).toBeCloseTo(drawn.corner[0], 9);
      expect(drawn.end[1]).toBeCloseTo(drawn.corner[1], 9);
      expect(card.draw[1]).toBeLessThan(card.def.hold[1]);
    }
  });

  it("keeps the square on the moving card's corner while the card swings away", () => {
    for (const card of DECK) {
      for (const p of steps(card.def.hold[1], card.def.out, 10).slice(0, -1)) {
        const frame = connectorFrame(p, STAGE, SIZES)!;
        const corner = cardCorner(cardPose(card.index, p, STAGE), CARD, card.corner, STAGE);
        expect(frame.corner).toEqual(corner);
        expect(frame.end).toEqual(corner);
        expect(frame.rotate).toBe(cardPose(card.index, p, STAGE).rotate);
      }
      // It fades with the card.
      expect(connectorFrame(card.def.out - 1e-7, STAGE, SIZES)!.opacity).toBeLessThan(0.01);
    }
  });

  it("is re-pointed at the card on stage and gone outside the cards or before the stage is measured", () => {
    expect(connectorFrame(midHold(1), STAGE, SIZES)!.card).toBe(1);
    expect(connectorFrame(midHold(3), STAGE, SIZES)!.card).toBe(3);
    expect(connectorFrame(faq.start, STAGE, SIZES)).toBeNull();
    expect(connectorFrame(DECK[DECK.length - 1].def.out, STAGE, SIZES)).toBeNull();
    expect(connectorFrame(midHold(0), { width: 0, height: 0 }, SIZES)).toBeNull();
    expect(connectorFrame(midHold(0), STAGE, [])).toBeNull();
  });

  it("fades out when its orange leaves the stage", () => {
    expect(onStage({ x: 10, y: 10, depth: 5 }, STAGE)).toBe(1);
    expect(onStage({ x: -24, y: 10, depth: 5 }, STAGE)).toBeCloseTo(0.5, 9);
    expect(onStage({ x: 10, y: STAGE.height + 100, depth: 5 }, STAGE)).toBe(0);
    expect(onStage({ x: 10, y: 10, depth: -1 }, STAGE)).toBe(0);
  });

  it("reads its timings from the script", () => {
    expect(DECK.map((c) => c.draw)).toEqual(FAQ.cards.map((c) => c.draw));
  });
});

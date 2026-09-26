// Pixi's CSP-compatible shader helpers avoid dynamic code generation; CSP stays strict.
import "pixi.js/unsafe-eval";
import { Application, useApplication } from "@pixi/react";
import { Container, type FederatedPointerEvent, Graphics, Text, Texture } from "pixi.js";
import { Viewport } from "pixi-viewport";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { MapPolygon } from "../../../content/map";
import type { TurnSnapshot } from "../../../sim";
import { pickMarket } from "./hit-test";
import { geometry, heatBand, mapSettings } from "./model";

export interface MapCommand {
  kind: "home" | "in" | "out" | "locate";
  serial: number;
  market?: string;
}
export interface MapHover {
  id: string;
  x: number;
  y: number;
}
interface Props {
  countryNames: Record<string, string>;
  snapshot: TurnSnapshot;
  selected: string | null;
  command: MapCommand;
  patterns: boolean;
  rivals: boolean;
  onSelect: (id: string) => void;
  onHover: (hover: MapHover | null) => void;
}
interface SceneProps extends Props {
  host: HTMLElement;
  onReady: () => void;
}
interface MapController {
  update: (
    state: Pick<Props, "snapshot" | "selected" | "patterns" | "rivals" | "countryNames">,
  ) => void;
  command: (command: MapCommand) => void;
}

function drawShape(graphics: Graphics, polygons: MapPolygon[], texture?: Texture): Graphics {
  graphics.clear();
  for (const polygon of polygons) {
    graphics.poly(polygon.outer).fill(texture ? { texture, textureSpace: "global" } : 0xffffff);
    for (const hole of polygon.holes) graphics.poly(hole).cut();
  }
  return graphics;
}

function patternTexture(band: number): Texture {
  const canvas = document.createElement("canvas");
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not initialize map patterns.");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, 32, 32);
  ctx.strokeStyle = "#678779";
  ctx.fillStyle = "#678779";
  ctx.lineWidth = 1;
  if (band === 1 || band === 2) {
    const spacing = band === 1 ? 32 : 16;
    for (let x = 4; x < 32; x += spacing)
      for (let y = 4; y < 32; y += spacing) {
        ctx.beginPath();
        ctx.arc(x, y, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
  } else {
    const spacing = band >= 5 ? 8 : 16;
    for (let x = -32; x <= 64; x += spacing) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + 32, 32);
      ctx.stroke();
    }
    if (band === 4 || band === 6)
      for (let x = -32; x <= 64; x += spacing) {
        ctx.beginPath();
        ctx.moveTo(x, 32);
        ctx.lineTo(x + 32, 0);
        ctx.stroke();
      }
  }
  const texture = Texture.from(canvas);
  texture.source.style.addressMode = "repeat";
  return texture;
}

function MapScene(props: SceneProps) {
  const { app, isInitialised } = useApplication();
  const latest = useRef(props);
  latest.current = props;
  const controller = useRef<MapController | null>(null);
  const { host } = props;

  useEffect(() => {
    // @pixi/react can deliver a prop update while app.init() is still awaiting the renderer.
    // Campaign loads reset the camera immediately; wait for its initialized context delivery.
    if (!isInitialised) return;
    const settings = mapSettings.camera;
    const styles = getComputedStyle(host);
    const color = (name: string) => styles.getPropertyValue(name).trim();
    const palette = mapSettings.heatBands.map((_, i) => color(`--heat-${i}`));
    palette.push(color(`--heat-${mapSettings.heatBands.length}`));
    const textures = new Map(
      mapSettings.heatBands.map((_, index) => [index + 1, patternTexture(index + 1)]),
    );
    const viewport = new Viewport({
      screenWidth: host.clientWidth,
      screenHeight: host.clientHeight,
      worldWidth: geometry.width,
      worldHeight: geometry.height,
      events: app.renderer.events,
      noTicker: true,
      passiveWheel: false,
    });
    viewport
      .drag({ wheel: false })
      .pinch()
      .wheel({ smooth: false })
      .clamp({ direction: "all", underflow: "center" });
    app.stage.addChild(viewport);
    const grid = new Graphics();
    for (const line of geometry.graticule) {
      grid.moveTo(line[0] ?? 0, line[1] ?? 0);
      for (let i = 2; i < line.length; i += 2) grid.lineTo(line[i] ?? 0, line[i + 1] ?? 0);
    }
    grid.stroke({ color: 0xf2ffff, alpha: 0.24, width: 0.8 });
    grid.eventMode = "none";
    viewport.addChild(grid);
    const depths = new Container();
    depths.y = 6;
    const lands = new Container();
    const edges = new Graphics();
    const entries = geometry.shapes.map((shape) => {
      const depth = drawShape(new Graphics(), shape.polygons);
      depth.tint = color("--land-depth");
      depths.addChild(depth);
      const face = drawShape(
        new Graphics(),
        shape.polygons,
        shape.market ? undefined : textures.get(3),
      );
      face.tint = shape.market ? (palette[0] ?? "#b8d89c") : color("--neutral-land");
      lands.addChild(face);
      for (const polygon of shape.polygons) {
        edges.poly(polygon.outer).stroke({ color: color("--land-edge"), width: 0.8, alpha: 0.9 });
        for (const hole of polygon.holes)
          edges.poly(hole).stroke({ color: color("--land-edge"), width: 0.8, alpha: 0.9 });
      }
      return { shape, face, pattern: -1 };
    });
    for (const layer of [depths, lands, edges]) {
      layer.eventMode = "none";
      viewport.addChild(layer);
    }
    const rivalMarks = new Graphics();
    rivalMarks.eventMode = "none";
    viewport.addChild(rivalMarks);
    const selectedLand = new Graphics();
    selectedLand.eventMode = "none";
    viewport.addChild(selectedLand);
    const markers = new Graphics();
    markers.eventMode = "none";
    viewport.addChild(markers);
    const labels = new Container();
    labels.eventMode = "none";
    viewport.addChild(labels);
    const countryLabels = mapSettings.labels.map((id) => {
      const label = new Text({
        text: latest.current.countryNames[id] ?? id,
        style: {
          fontFamily: "Segoe UI",
          fontSize: 9,
          fontWeight: "700",
          letterSpacing: 0.7,
          fill: color("--ink"),
          stroke: { color: 0xd5efcc, width: 2 },
        },
        resolution: 2,
      });
      label.anchor.set(0.5, 0);
      labels.addChild(label);
      return { id, label };
    });
    const selectedBubble = new Container();
    selectedBubble.eventMode = "none";
    const bubble = new Graphics();
    const selectedText = new Text({
      text: "",
      style: { fontFamily: "Segoe UI", fontSize: 10, fontWeight: "800", fill: 0xffffff },
      resolution: 2,
    });
    selectedText.anchor.set(0, 0.5);
    selectedBubble.addChild(bubble, selectedText);
    viewport.addChild(selectedBubble);
    let frame = 0;
    let renderedFrames = 0;
    let disposed = false;
    let baseScale = 1;
    const syncCamera = () => {
      markers.clear();
      for (const [id, market] of Object.entries(geometry.markets)) {
        const [left, top, right, bottom] = market.bounds;
        if (
          market.point ||
          (right - left) * (bottom - top) * viewport.scale.x ** 2 < settings.smallMarketArea
        ) {
          markers
            .circle(...market.center, 3 / viewport.scale.x)
            .fill(id === latest.current.selected ? color("--accent") : color("--second"))
            .stroke({ width: 1 / viewport.scale.x, color: 0xf4ffff });
        }
      }
      const selected = latest.current.selected ? geometry.markets[latest.current.selected] : null;
      for (const { id, label } of countryLabels) {
        const market = geometry.markets[id];
        if (!market) continue;
        label.scale.set(1 / viewport.scale.x);
        label.position.set(market.center[0], market.center[1] + 13 / viewport.scale.x);
        label.visible = id !== latest.current.selected;
      }
      selectedBubble.visible = !!selected;
      if (selected) {
        markers
          .circle(...selected.center, 8 / viewport.scale.x)
          .stroke({ color: color("--accent"), width: 2 / viewport.scale.x });
        const screen = viewport.toScreen(...selected.center);
        selectedText.text = latest.current.countryNames[latest.current.selected ?? ""] ?? "";
        const offset =
          screen.x + selectedText.width + 35 > mapWidth() ? -selectedText.width - 35 : 14;
        selectedText.x = offset + 9;
        selectedBubble.position.set(...selected.center);
        selectedBubble.scale.set(1 / viewport.scale.x);
        bubble
          .clear()
          .roundRect(offset, -12, selectedText.width + 18, 24, 6)
          .fill(color("--accent"));
        host.dataset.selectedX = String(screen.x);
        host.dataset.selectedY = String(screen.y);
      }
      host.dataset.camera = `${viewport.x.toFixed(2)},${viewport.y.toFixed(2)},${viewport.scale.x.toFixed(3)}`;
      host.dataset.zoom = String(viewport.scale.x / baseScale);
      host.dataset.hitTargetPixels = String(settings.hitTargetPixels);
    };
    const invalidate = () => {
      if (!frame && !disposed)
        frame = requestAnimationFrame(() => {
          frame = 0;
          viewport.update(16);
          syncCamera();
          app.render();
          host.dataset.frames = String(++renderedFrames);
          host.dataset.drawnTurn = host.dataset.turn ?? "";
        });
    };
    const mapWidth = () => host.clientWidth - (host.clientWidth > 850 ? 330 : 0);
    const home = () => {
      // Camera bounds keep island targets clear of the country card, even at the dateline.
      baseScale = Math.min(mapWidth() / geometry.width, (host.clientHeight - 70) / geometry.height);
      viewport.clampZoom({
        minScale: baseScale * settings.minZoom,
        maxScale: baseScale * settings.maxZoom,
      });
      viewport.setZoom(baseScale);
      viewport.moveCenter(geometry.width / 2, geometry.height / 2 - 20 / baseScale);
      invalidate();
    };
    const resize = () => {
      // Growth shares the main screen. Preserve the camera while the map is hidden.
      if (host.clientWidth === 0 || host.clientHeight === 0) return;
      const oldScale = viewport.scale.x / baseScale;
      const center = viewport.center;
      app.renderer.resize(host.clientWidth, host.clientHeight);
      viewport.resize(mapWidth(), host.clientHeight);
      home();
      if (host.dataset.ready === "true") {
        viewport.setZoom(baseScale * oldScale);
        viewport.moveCenter(center);
      }
      invalidate();
    };
    const hit = (x: number, y: number) =>
      pickMarket(
        geometry,
        x,
        y,
        viewport.scale.x,
        settings.hitTargetPixels,
        settings.smallMarketArea,
      );
    const onMove = (event: FederatedPointerEvent) => {
      if (event.buttons) {
        latest.current.onHover(null);
        return;
      }
      const point = viewport.toWorld(event.global);
      const id = hit(point.x, point.y);
      latest.current.onHover(id ? { id, x: event.global.x, y: event.global.y } : null);
      app.canvas.style.cursor = id ? "pointer" : "grab";
    };
    viewport.on("pointermove", onMove);
    viewport.on("pointerleave", () => latest.current.onHover(null));
    viewport.on("clicked", (event: { world: { x: number; y: number } }) => {
      const id = hit(event.world.x, event.world.y);
      if (id) {
        latest.current.onSelect(id);
        latest.current.onHover(null);
      }
    });
    viewport.on("moved", invalidate);
    viewport.on("zoomed", invalidate);
    viewport.on("drag-start", () => latest.current.onHover(null));
    const update: MapController["update"] = (current) => {
      const countries = new Map(
        current.snapshot.countries.map((country) => [country.countryId, country]),
      );
      for (const { id, label } of countryLabels) label.text = current.countryNames[id] ?? id;
      rivalMarks.clear();
      selectedLand.clear();
      for (const entry of entries) {
        if (!entry.shape.market) continue;
        const country = countries.get(entry.shape.market);
        const bin = heatBand(country?.share ?? 0, mapSettings.heatBands);
        const pattern = current.patterns && bin > 0 ? bin : -1;
        if (entry.pattern !== pattern) {
          drawShape(
            entry.face,
            entry.shape.polygons,
            pattern < 0 ? undefined : textures.get(pattern),
          );
          entry.pattern = pattern;
        }
        entry.face.tint = palette[bin] ?? palette[0] ?? "#b8d89c";
        if (entry.shape.market === current.selected) {
          for (const polygon of entry.shape.polygons)
            selectedLand.poly(polygon.outer).stroke({ color: color("--accent"), width: 2 });
        }
      }
      if (current.rivals)
        for (const country of current.snapshot.countries) {
          if (
            !country.rivals.some(
              (rival) => rival.level === "defending" || rival.level === "entrenched",
            )
          )
            continue;
          const market = geometry.markets[country.countryId];
          if (market)
            rivalMarks.circle(...market.center, 5).stroke({ color: color("--warning"), width: 2 });
        }
      host.dataset.turn = String(current.snapshot.turn);
      host.dataset.patterns = String(current.patterns);
      host.dataset.rivals = String(current.rivals);
      host.dataset.selected = current.selected ?? "";
      invalidate();
    };
    controller.current = {
      update,
      command(command) {
        latest.current.onHover(null);
        if (command.kind === "home") home();
        else if (command.kind === "locate" && command.market) {
          const market = geometry.markets[command.market];
          if (market) {
            viewport.setZoom(baseScale * settings.locateZoom);
            viewport.moveCenter(...market.center);
          }
        } else
          viewport.setZoom(
            viewport.scale.x * (command.kind === "in" ? settings.zoomStep : 1 / settings.zoomStep),
          );
        invalidate();
      },
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();
    update(latest.current);
    host.dataset.ready = "true";
    host.dataset.markets = String(Object.keys(geometry.markets).length);
    host.dataset.renderer = app.renderer.name;
    latest.current.onReady();
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      controller.current = null;
      delete host.dataset.ready;
      viewport.destroy({ children: true });
      for (const texture of textures.values()) texture.destroy(true);
    };
  }, [app, host, isInitialised]);

  useEffect(() => {
    controller.current?.update({
      snapshot: props.snapshot,
      countryNames: props.countryNames,
      selected: props.selected,
      patterns: props.patterns,
      rivals: props.rivals,
    });
  }, [props.snapshot, props.selected, props.patterns, props.rivals, props.countryNames]);
  useEffect(() => {
    controller.current?.command(props.command);
  }, [props.command]);
  return null;
}

export function WorldMap(props: Props) {
  const { t } = useTranslation();
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const readyRef = useRef(false);
  useEffect(() => {
    const onFailure = () => {
      if (!readyRef.current) setFailed(true);
    };
    window.addEventListener("unhandledrejection", onFailure);
    return () => window.removeEventListener("unhandledrejection", onFailure);
  }, []);
  return (
    <section
      ref={setHost}
      className="map-host"
      data-testid="world-map"
      aria-label={t("map.description")}
    >
      {host && (
        <Application
          resizeTo={host}
          autoStart={false}
          autoDensity
          resolution={Math.min(window.devicePixelRatio, 2)}
          preference="webgl"
          backgroundAlpha={0}
          antialias
          onInit={(app) => {
            app.canvas.addEventListener("webglcontextlost", () => setFailed(true));
          }}
        >
          <MapScene
            {...props}
            host={host}
            onReady={() => {
              readyRef.current = true;
              setReady(true);
            }}
          />
        </Application>
      )}
      {(!ready || failed) && (
        <div className="map-loading" role="status">
          {t(failed ? "map.failed" : "map.loading")}
          {failed && (
            <button type="button" onClick={() => location.reload()}>
              {t("map.retry")}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

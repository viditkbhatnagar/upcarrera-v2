import { useCallback, useState } from "react";
import Cropper from "react-easy-crop";
import type { Area } from "react-easy-crop";
import { RotateCcw, RotateCw, Check, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

const OUTPUT_MAX = 600; // longest edge of the saved image

function createImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.addEventListener("load", () => resolve(img));
    img.addEventListener("error", (e) => reject(e));
    img.src = url;
  });
}
const toRad = (deg: number) => (deg * Math.PI) / 180;
function rotatedSize(w: number, h: number, rotation: number) {
  const r = toRad(rotation);
  return {
    width: Math.abs(Math.cos(r) * w) + Math.abs(Math.sin(r) * h),
    height: Math.abs(Math.sin(r) * w) + Math.abs(Math.cos(r) * h),
  };
}

/** Render the selected crop (with rotation) to a JPEG blob, capped at OUTPUT_MAX. */
async function cropToBlob(src: string, crop: Area, rotation: number): Promise<Blob> {
  const image = await createImage(src);
  const { width: bw, height: bh } = rotatedSize(image.width, image.height, rotation);

  const full = document.createElement("canvas");
  full.width = Math.ceil(bw);
  full.height = Math.ceil(bh);
  const fctx = full.getContext("2d");
  if (!fctx) throw new Error("Canvas not supported");
  fctx.translate(bw / 2, bh / 2);
  fctx.rotate(toRad(rotation));
  fctx.drawImage(image, -image.width / 2, -image.height / 2);

  const scale = Math.min(1, OUTPUT_MAX / Math.max(crop.width, crop.height));
  const outW = Math.max(1, Math.round(crop.width * scale));
  const outH = Math.max(1, Math.round(crop.height * scale));

  const out = document.createElement("canvas");
  out.width = outW;
  out.height = outH;
  const octx = out.getContext("2d");
  if (!octx) throw new Error("Canvas not supported");
  octx.imageSmoothingQuality = "high";
  octx.drawImage(full, crop.x, crop.y, crop.width, crop.height, 0, 0, outW, outH);

  return new Promise((resolve, reject) =>
    out.toBlob((b) => (b ? resolve(b) : reject(new Error("Crop failed"))), "image/jpeg", 0.9),
  );
}

export function ImageCropDialog({
  src,
  fileName = "photo.jpg",
  aspect = 1,
  title = "Crop photo",
  onCancel,
  onCropped,
}: {
  src: string | null;
  fileName?: string;
  aspect?: number;
  title?: string;
  onCancel: () => void;
  onCropped: (file: File) => void;
}) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [areaPixels, setAreaPixels] = useState<Area | null>(null);
  const [saving, setSaving] = useState(false);

  const onComplete = useCallback((_: Area, areaPx: Area) => setAreaPixels(areaPx), []);

  const reset = () => {
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setRotation(0);
  };

  const save = async () => {
    if (!src || !areaPixels) return;
    setSaving(true);
    try {
      const blob = await cropToBlob(src, areaPixels, rotation);
      onCropped(new File([blob], fileName, { type: "image/jpeg" }));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!src} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="relative h-72 w-full overflow-hidden rounded-xl bg-neutral-900">
          {src && (
            <Cropper
              image={src}
              crop={crop}
              zoom={zoom}
              rotation={rotation}
              aspect={aspect}
              cropShape="round"
              showGrid={false}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onRotationChange={setRotation}
              onCropComplete={onComplete}
            />
          )}
        </div>

        <div className="space-y-3 py-1">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Zoom
            </span>
            <input
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="w-full accent-primary"
            />
          </label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setRotation((r) => (r - 90 + 360) % 360)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-foreground transition hover:bg-muted"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Rotate left
            </button>
            <button
              type="button"
              onClick={() => setRotation((r) => (r + 90) % 360)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-foreground transition hover:bg-muted"
            >
              <RotateCw className="h-3.5 w-3.5" /> Rotate right
            </button>
            <button
              type="button"
              onClick={reset}
              className="ml-auto text-xs font-semibold text-muted-foreground hover:text-foreground"
            >
              Reset
            </button>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-muted"
          >
            <X className="h-4 w-4" /> Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving || !areaPixels}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Check className="h-4 w-4" /> {saving ? "Saving…" : "Use photo"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

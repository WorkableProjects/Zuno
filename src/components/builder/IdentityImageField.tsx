import { useRef, useState } from "react";
import { ImagePlus } from "lucide-react";
import { ALLOWED_IMAGE_MIME, LIMITS, formatBytes } from "../../game-files/schema/common";

/** Uploaded pictures are scaled down so a whole deck fits in one file. */
const MAX_IMAGE_SIDE = 720;

/** Reads a picked image, scales it down when it is large, and returns a data URL. */
async function readImage(file: File): Promise<string> {
  const original = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("read"));
    reader.readAsDataURL(file);
  });
  if (file.type === "image/gif") return original;
  try {
    const img = new Image();
    img.src = original;
    await img.decode();
    const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    if (scale === 1 && file.size < 200 * 1024) return original;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
    const webp = canvas.toDataURL("image/webp", 0.85);
    const out = webp.startsWith("data:image/webp") ? webp : canvas.toDataURL("image/jpeg", 0.85);
    return out.length < original.length ? out : original;
  } catch {
    return original;
  }
}

/** Upload or link one picture for an identity card. */
export function IdentityImageField({ value, onChange, label = "Image", hint }: { value: string | null; onChange: (next: string | null) => void; label?: string; hint?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [link, setLink] = useState("");

  const onPick = async (picked: File | undefined) => {
    if (!picked) return;
    if (!(ALLOWED_IMAGE_MIME as readonly string[]).includes(picked.type)) {
      setProblem("That image format is not supported. Use PNG, JPEG, WebP or GIF.");
      return;
    }
    if (picked.size > LIMITS.maxImageBytes) {
      setProblem(`That image is ${formatBytes(picked.size)}. Images can be up to ${formatBytes(LIMITS.maxImageBytes)}.`);
      return;
    }
    try {
      onChange(await readImage(picked));
      setProblem(null);
    } catch {
      setProblem("Zuno could not read that image. Try another one.");
    }
  };

  const applyLink = (text: string) => {
    const v = text.trim();
    if (!v) return;
    if (!/^https:\/\//i.test(v)) {
      setProblem("The link must start with https://.");
      return;
    }
    setProblem(null);
    setLink("");
    onChange(v);
  };

  return (
    <div className="field image-field">
      <span className="field-label">{label}</span>
      <div className="cover-row">
        {value && <img className="cover-thumb" src={value} alt="Image preview" />}
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => input.current?.click()}>
          <ImagePlus size={18} strokeWidth={1.5} />
          {value ? "Replace" : "Upload"}
        </button>
        {value && (
          <button
            type="button"
            className="btn btn-quiet btn-sm"
            onClick={() => {
              setProblem(null);
              onChange(null);
            }}
          >
            Remove
          </button>
        )}
      </div>
      <input
        className="input"
        type="url"
        value={link}
        placeholder="Or paste an https image link"
        aria-label="Image link"
        onChange={(e) => setLink(e.target.value)}
        onBlur={() => applyLink(link)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            applyLink(link);
          }
        }}
      />
      <span className="field-hint">{hint ?? `Uploads are stored inside the game file, scaled to ${MAX_IMAGE_SIDE}px. Links depend on the other site staying up.`}</span>
      {problem && (
        <p className="field-hint image-problem" role="alert">
          {problem}
        </p>
      )}
      <input
        ref={input}
        type="file"
        accept={ALLOWED_IMAGE_MIME.join(",")}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          void onPick(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </div>
  );
}


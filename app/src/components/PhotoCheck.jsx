import { useEffect, useState } from "react";

// Reads the hidden details (EXIF) stored inside a JPEG photo, on the device.
// Returns null when the photo has none (common for pictures saved from the web).
function readExif(buffer) {
  const view = new DataView(buffer);
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return null;
  let offset = 2;
  while (offset + 4 < view.byteLength) {
    const marker = view.getUint16(offset);
    const size = view.getUint16(offset + 2);
    if (marker === 0xffe1 && view.getUint32(offset + 4) === 0x45786966) {
      return parseTiff(view, offset + 10);
    }
    if ((marker & 0xff00) !== 0xff00 || size < 2) break;
    offset += 2 + size;
  }
  return null;
}

function parseTiff(view, start) {
  const little = view.getUint16(start) === 0x4949;
  const u16 = (o) => view.getUint16(o, little);
  const u32 = (o) => view.getUint32(o, little);
  const text = (o, n) => {
    let s = "";
    for (let i = 0; i < n && o + i < view.byteLength; i += 1) {
      const c = view.getUint8(o + i);
      if (c === 0) break;
      s += String.fromCharCode(c);
    }
    return s.trim();
  };
  const readIfd = (ifdOffset) => {
    const tags = {};
    const base = start + ifdOffset;
    if (base + 2 > view.byteLength) return tags;
    const count = u16(base);
    for (let i = 0; i < count; i += 1) {
      const e = base + 2 + i * 12;
      if (e + 12 > view.byteLength) break;
      const tag = u16(e);
      const type = u16(e + 2);
      const n = u32(e + 4);
      if (type === 2) tags[tag] = text(n > 4 ? start + u32(e + 8) : e + 8, n);
      else if (type === 4) tags[tag] = u32(e + 8);
      else if (type === 3) tags[tag] = u16(e + 8);
    }
    return tags;
  };
  try {
    const ifd0 = readIfd(u32(start + 4));
    const exif = ifd0[0x8769] ? readIfd(ifd0[0x8769]) : {};
    return {
      make: ifd0[0x010f] || "",
      model: ifd0[0x0110] || "",
      software: ifd0[0x0131] || "",
      taken: exif[0x9003] || ifd0[0x0132] || "",
      hasLocation: Boolean(ifd0[0x8825]),
    };
  } catch {
    return null;
  }
}

function prettyDate(exifDate) {
  const m = /^(\d{4}):(\d{2}):(\d{2})/.exec(exifDate || "");
  if (!m) return "";
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

const EDIT_TOOLS = /photoshop|lightroom|gimp|facetune|picsart|snapseed|canva|meitu|remini|faceapp|midjourney|stable diffusion|dall/i;

function PhotoCheck() {
  const [preview, setPreview] = useState("");
  const [details, setDetails] = useState(null);
  const [checked, setChecked] = useState(false);
  const [photoUrl, setPhotoUrl] = useState("");
  const [error, setError] = useState("");

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Pick a photo file (JPG or PNG).");
      return;
    }
    setError("");
    setPreview(URL.createObjectURL(file));
    try {
      const buffer = await file.slice(0, 256 * 1024).arrayBuffer();
      setDetails(readExif(buffer));
    } catch {
      setDetails(null);
    }
    setChecked(true);
  }

  const notes = [];
  if (checked) {
    if (!details) {
      notes.push("This photo has no hidden camera details. That's normal for pictures sent through social media or saved from a website. It also means the photo may not have come from the person's own phone.");
    } else {
      if (details.make || details.model) notes.push(`Taken with: ${[details.make, details.model].filter(Boolean).join(" ")}.`);
      if (details.taken) notes.push(`Date taken: ${prettyDate(details.taken) || details.taken}. Does that match what they told you?`);
      if (details.software && EDIT_TOOLS.test(details.software)) notes.push(`This photo was edited with ${details.software}.`);
      if (details.hasLocation) notes.push("This photo contains location data. Never share your own photos with strangers without removing it.");
      if (!details.make && !details.model && !details.taken) notes.push("Only a few hidden details were found. The photo was probably saved or edited after it was taken.");
    }
  }

  const enc = encodeURIComponent(photoUrl.trim());
  const hasUrl = /^https?:\/\/\S+$/i.test(photoUrl.trim());

  return (
    <section className="link-check photo-check">
      <h2>Check a Photo</h2>
      <p className="subtext">
        Romance, rental and Marketplace scammers use stolen photos of real people and real homes.
        A reverse image search shows if the photo appears somewhere else under a different name.
      </p>

      <label className="field-label" htmlFor="photo-file">The photo they sent you</label>
      <input id="photo-file" type="file" accept="image/*" onChange={handleFile} />
      <p className="subtext">The photo stays on your device. Nothing is uploaded.</p>
      {error && <p className="error">{error}</p>}

      {checked && (
        <div className="result risk-medium">
          <div className="photo-row">
            {preview && <img src={preview} alt="The photo you picked" className="photo-thumb" />}
            <div>
              <h3>What's inside this photo</h3>
              <ul>{notes.map((n) => <li key={n}>{n}</li>)}</ul>
            </div>
          </div>
        </div>
      )}

      <h3 className="step-title">Search for the photo online</h3>
      <label className="field-label" htmlFor="photo-url">Photo's web address (optional)</label>
      <input
        id="photo-url"
        type="text"
        inputMode="url"
        autoCapitalize="none"
        autoCorrect="off"
        placeholder="Right-click or long-press their profile photo, copy image address"
        value={photoUrl}
        onChange={(e) => setPhotoUrl(e.target.value)}
      />
      <p className="subtext">
        {hasUrl
          ? "These buttons search for that exact photo."
          : "No web address? Open a search site below and upload the photo there."}
      </p>
      <div className="button-row">
        <a href={hasUrl ? `https://tineye.com/search?url=${enc}` : "https://tineye.com/"} target="_blank" rel="noopener noreferrer">
          <button type="button">Search with TinEye</button>
        </a>
        <a
          href={hasUrl ? `https://www.bing.com/images/search?view=detailv2&iss=sbi&q=imgurl:${enc}` : "https://www.bing.com/visualsearch"}
          target="_blank"
          rel="noopener noreferrer"
        >
          <button type="button">Search with Bing</button>
        </a>
      </div>

      <ul className="insurance-red-flags">
        <li>The same photo shows up with a different name, or on a model's or stock photo page</li>
        <li>Every photo looks professional, and there are no casual everyday pictures</li>
        <li>They won't send a new photo holding a note with today's date, or won't video chat</li>
        <li>A rental listing's photos also appear in another listing in a different city</li>
      </ul>
    </section>
  );
}

export default PhotoCheck;

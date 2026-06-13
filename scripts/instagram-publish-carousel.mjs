#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const GRAPH_BASE = "https://graph.facebook.com/v20.0";

function getArg(flag, fallback = "") {
  const i = process.argv.indexOf(flag);
  if (i === -1 || i + 1 >= process.argv.length) return fallback;
  return process.argv[i + 1];
}

function die(message) {
  console.error(`[instagram-publish] ${message}`);
  process.exit(1);
}

function ensureEnv(name) {
  const value = process.env[name];
  if (!value) die(`Missing required env var: ${name}`);
  return value;
}

function boolEnv(name, defaultValue = false) {
  const raw = process.env[name];
  if (raw === undefined) return defaultValue;
  return ["1", "true", "yes", "on"].includes(String(raw).toLowerCase());
}

async function graphPost(endpoint, payload, token) {
  const url = `${GRAPH_BASE}${endpoint}`;
  const body = new URLSearchParams({ ...payload, access_token: token });
  const res = await fetch(url, { method: "POST", body });
  const data = await res.json();
  if (!res.ok || data.error) {
    const msg = data?.error?.message || JSON.stringify(data);
    throw new Error(`Graph API POST ${endpoint} failed: ${msg}`);
  }
  return data;
}

function collectImages(folder, explicitListCsv = "") {
  if (explicitListCsv) {
    return explicitListCsv
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean)
      .map((p) => path.resolve(p));
  }

  const absFolder = path.resolve(folder);
  if (!fs.existsSync(absFolder)) die(`Folder does not exist: ${absFolder}`);
  const files = fs.readdirSync(absFolder);
  const images = files
    .filter((f) => /\.jpe?g$/i.test(f))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((f) => path.join(absFolder, f));

  if (images.length === 0) {
    die(`No JPG files found in folder: ${absFolder}`);
  }

  return images;
}

function contentTypeFor(filePath) {
  if (/\.png$/i.test(filePath)) return "image/png";
  return "image/jpeg";
}

async function uploadToSupabaseAndGetUrl(localFile, opts) {
  const absFile = path.resolve(localFile);
  const absRoot = path.resolve(opts.localAssetRoot);
  const rel = path.relative(absRoot, absFile);
  if (rel.startsWith("..")) {
    die(`File is outside LOCAL_ASSET_ROOT: ${absFile}`);
  }

  const normalizedRel = rel.split(path.sep).join("/");
  const objectPath = `${opts.objectPrefix.replace(/\/$/, "")}/${normalizedRel}`.replace(/^\/+/, "");
  const uploadUrl = `${opts.supabaseUrl.replace(/\/$/, "")}/storage/v1/object/${opts.bucket}/${objectPath}`;
  const fileBuffer = fs.readFileSync(absFile);

  const uploadRes = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.supabaseServiceRoleKey}`,
      apikey: opts.supabaseServiceRoleKey,
      "Content-Type": contentTypeFor(absFile),
      "x-upsert": "true",
    },
    body: fileBuffer,
  });
  const uploadData = await uploadRes.json().catch(() => ({}));
  if (!uploadRes.ok) {
    const msg = uploadData?.error || uploadData?.message || JSON.stringify(uploadData);
    throw new Error(`Supabase upload failed for ${objectPath}: ${msg}`);
  }

  if (opts.bucketPublic) {
    return `${opts.supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/${opts.bucket}/${objectPath}`;
  }

  const signUrl = `${opts.supabaseUrl.replace(/\/$/, "")}/storage/v1/object/sign/${opts.bucket}/${objectPath}`;
  const signRes = await fetch(signUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.supabaseServiceRoleKey}`,
      apikey: opts.supabaseServiceRoleKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ expiresIn: opts.signedUrlExpiresIn }),
  });
  const signData = await signRes.json();
  if (!signRes.ok || !signData?.signedURL) {
    const msg = signData?.error || signData?.message || JSON.stringify(signData);
    throw new Error(`Supabase signed URL failed for ${objectPath}: ${msg}`);
  }

  return `${opts.supabaseUrl.replace(/\/$/, "")}/storage/v1${signData.signedURL}`;
}

async function main() {
  const igUserId = ensureEnv("IG_USER_ID");
  const accessToken = ensureEnv("META_LONG_LIVED_ACCESS_TOKEN");
  const supabaseUrl = ensureEnv("SUPABASE_URL");
  const supabaseServiceRoleKey = ensureEnv("SUPABASE_SERVICE_ROLE_KEY");
  const bucket = ensureEnv("SUPABASE_BUCKET");
  const localAssetRoot = ensureEnv("LOCAL_ASSET_ROOT");
  const bucketPublic = boolEnv("SUPABASE_BUCKET_PUBLIC", true);
  const signedUrlExpiresIn = Number(process.env.SUPABASE_SIGNED_URL_EXPIRES_IN || 3600);
  const datePart = new Date().toISOString().slice(0, 10);
  const objectPrefix = process.env.SUPABASE_OBJECT_PREFIX || `ig-carousels/${datePart}`;

  const folder = getArg("--folder");
  const captionArg = getArg("--caption");
  const captionFile = getArg("--caption-file");
  const imageListCsv = getArg("--images");

  if (!folder && !imageListCsv) {
    die("Provide either --folder <path> or --images <csv-of-image-paths>");
  }

  const caption = captionArg
    || (captionFile ? fs.readFileSync(path.resolve(captionFile), "utf8").trim() : "")
    || "Practical growth systems for AI-era visibility. #AEO #SEO #GEO #BusinessGrowth #Helio";

  const imagePaths = collectImages(folder, imageListCsv);
  if (imagePaths.length < 2) die("Instagram carousel needs at least 2 images.");
  if (imagePaths.length > 10) die("Instagram carousel supports max 10 images.");

  const mediaContainerIds = [];
  const uploadedUrls = [];
  const uploadOpts = {
    supabaseUrl,
    supabaseServiceRoleKey,
    bucket,
    localAssetRoot,
    bucketPublic,
    signedUrlExpiresIn,
    objectPrefix,
  };

  for (const img of imagePaths) {
    const imageUrl = await uploadToSupabaseAndGetUrl(img, uploadOpts);
    uploadedUrls.push(imageUrl);
    const media = await graphPost(`/${igUserId}/media`, {
      image_url: imageUrl,
      is_carousel_item: "true",
    }, accessToken);
    mediaContainerIds.push(media.id);
  }

  const carousel = await graphPost(`/${igUserId}/media`, {
    media_type: "CAROUSEL",
    children: mediaContainerIds.join(","),
    caption,
  }, accessToken);

  const published = await graphPost(`/${igUserId}/media_publish`, {
    creation_id: carousel.id,
  }, accessToken);

  const permalink = `https://www.instagram.com/p/${published.id}/`;
  console.log(JSON.stringify({
    ok: true,
    igUserId,
    bucket,
    objectPrefix,
    imageCount: imagePaths.length,
    uploadedUrls,
    creationId: carousel.id,
    mediaId: published.id,
    permalink,
  }, null, 2));
}

main().catch((err) => {
  console.error(`[instagram-publish] ${err.message}`);
  process.exit(1);
});

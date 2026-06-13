var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs/promises";
import path from "node:path";
import { buildHelioCodeEvidence, createHelioCodeJobRecord, selectHelioCodeSkill } from "./src/lib/helio-code.js";
import { handleDataForSeoBacklinks } from "./src/server/dataforseo-backlinks.mjs";
import { handleHelioBacklinkAnalysis } from "./src/server/helio-backlink-api.mjs";
import { buildHelioCodeReadiness } from "./src/server/helio-code/readiness.mjs";
import { appendHelioCodeLog, createHelioCodeJob, getHelioCodeJob, listHelioCodeJobs } from "./src/server/helio-code/store.mjs";
import { getHelioCodeWorkerStatus, startHelioCodeWorker } from "./src/server/helio-code/worker-supervisor.mjs";
import { createApprovalToken, decideApprovalRequest, getApprovalRequest, listApprovalRequests, saveApprovalRequest } from "./src/server/approval-channel/store.mjs";
var readJsonBody = function (req) { return __awaiter(void 0, void 0, void 0, function () {
    var chunks, chunk, e_1_1, raw;
    var _a, req_1, req_1_1;
    var _b, e_1, _c, _d;
    return __generator(this, function (_e) {
        switch (_e.label) {
            case 0:
                chunks = [];
                _e.label = 1;
            case 1:
                _e.trys.push([1, 6, 7, 12]);
                _a = true, req_1 = __asyncValues(req);
                _e.label = 2;
            case 2: return [4 /*yield*/, req_1.next()];
            case 3:
                if (!(req_1_1 = _e.sent(), _b = req_1_1.done, !_b)) return [3 /*break*/, 5];
                _d = req_1_1.value;
                _a = false;
                chunk = _d;
                chunks.push(Buffer.from(chunk));
                _e.label = 4;
            case 4:
                _a = true;
                return [3 /*break*/, 2];
            case 5: return [3 /*break*/, 12];
            case 6:
                e_1_1 = _e.sent();
                e_1 = { error: e_1_1 };
                return [3 /*break*/, 12];
            case 7:
                _e.trys.push([7, , 10, 11]);
                if (!(!_a && !_b && (_c = req_1.return))) return [3 /*break*/, 9];
                return [4 /*yield*/, _c.call(req_1)];
            case 8:
                _e.sent();
                _e.label = 9;
            case 9: return [3 /*break*/, 11];
            case 10:
                if (e_1) throw e_1.error;
                return [7 /*endfinally*/];
            case 11: return [7 /*endfinally*/];
            case 12:
                raw = Buffer.concat(chunks).toString("utf8");
                return [2 /*return*/, raw ? JSON.parse(raw) : {}];
        }
    });
}); };
var sendJson = function (res, status, payload) {
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify(payload));
};
function helioAuditReportApi() {
    var _this = this;
    var reportsDir = path.resolve(process.cwd(), "reports");
    var ensureDir = function () { return __awaiter(_this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, fs.mkdir(reportsDir, { recursive: true })];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    }); };
    var handler = function (req, res, next) { return __awaiter(_this, void 0, void 0, function () {
        var urlObj, method, body, id, data, filepath, envelope, id, filepath, raw, envelope, _a, error_1;
        var _b, _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    _d.trys.push([0, 9, , 10]);
                    if (!((_b = req.url) === null || _b === void 0 ? void 0 : _b.startsWith("/api/audit-report")))
                        return [2 /*return*/, next()];
                    return [4 /*yield*/, ensureDir()];
                case 1:
                    _d.sent();
                    urlObj = new URL(req.url, "http://localhost");
                    method = String(req.method || "GET").toUpperCase();
                    if (!(method === "POST" && urlObj.pathname === "/api/audit-report")) return [3 /*break*/, 4];
                    return [4 /*yield*/, readJsonBody(req)];
                case 2:
                    body = _d.sent();
                    id = String((body === null || body === void 0 ? void 0 : body.id) || "");
                    data = body === null || body === void 0 ? void 0 : body.data;
                    if (!id || !data)
                        return [2 /*return*/, sendJson(res, 400, { error: "Missing id or data" })];
                    filepath = path.join(reportsDir, "".concat(id, ".json"));
                    envelope = {
                        id: id,
                        createdAt: new Date().toISOString(),
                        domain: String(((_c = data === null || data === void 0 ? void 0 : data.meta) === null || _c === void 0 ? void 0 : _c.domain) || (data === null || data === void 0 ? void 0 : data.domain) || "unknown-domain"),
                        data: data,
                    };
                    return [4 /*yield*/, fs.writeFile(filepath, JSON.stringify(envelope, null, 2), "utf8")];
                case 3:
                    _d.sent();
                    return [2 /*return*/, sendJson(res, 200, { ok: true, reportUrl: "/reports/".concat(id) })];
                case 4:
                    if (!(method === "GET" && urlObj.pathname === "/api/audit-report")) return [3 /*break*/, 8];
                    id = String(urlObj.searchParams.get("id") || "");
                    if (!id)
                        return [2 /*return*/, sendJson(res, 400, { error: "Missing id" })];
                    filepath = path.join(reportsDir, "".concat(id, ".json"));
                    _d.label = 5;
                case 5:
                    _d.trys.push([5, 7, , 8]);
                    return [4 /*yield*/, fs.readFile(filepath, "utf8")];
                case 6:
                    raw = _d.sent();
                    envelope = JSON.parse(raw);
                    return [2 /*return*/, sendJson(res, 200, { ok: true, envelope: envelope })];
                case 7:
                    _a = _d.sent();
                    return [2 /*return*/, sendJson(res, 404, { error: "Report not found" })];
                case 8: return [2 /*return*/, sendJson(res, 405, { error: "Method not allowed" })];
                case 9:
                    error_1 = _d.sent();
                    return [2 /*return*/, sendJson(res, 500, { error: (error_1 === null || error_1 === void 0 ? void 0 : error_1.message) || "Internal error" })];
                case 10: return [2 /*return*/];
            }
        });
    }); };
    return {
        name: "helio-audit-report-api",
        configureServer: function (server) {
            server.middlewares.use(handler);
        },
        configurePreviewServer: function (server) {
            server.middlewares.use(handler);
        },
    };
}
function helioCodeApi() {
    var _this = this;
    var jobs = new Map();
    var timers = new Map();
    var dbEnabled = function () { return !!String(process.env.DATABASE_URL || "").trim(); };
    var memoryFallbackAllowed = function () { return String(process.env.HELIO_CODE_ALLOW_MEMORY_FALLBACK || "false").toLowerCase() === "true"; };
    var localCompleteJob = function (job) {
        var now = new Date().toISOString();
        var skill = selectHelioCodeSkill({ issueType: job.payload.issueType, skillId: job.payload.skillId });
        var evidence = buildHelioCodeEvidence({
            job: job,
            repoProfile: {
                framework: "queued-worker",
                packageManager: "unknown",
                buildCommand: "worker-managed",
                testCommand: "worker-managed",
                note: "Local dev adapter created this evidence. Production jobs are completed by the Helio Code worker.",
            },
            changedFiles: ["helio-code/".concat(job.payload.missionId, "-").concat(skill.id, ".md")],
            checks: [
                { name: "payload-validation", status: "passed", details: "Mission-to-code job payload accepted." },
                { name: "skill-selection", status: "passed", details: "Selected ".concat(skill.name, ".") },
            ],
            pullRequestUrl: "",
            branch: "helio-code/".concat(job.payload.missionId),
        });
        return __assign(__assign({}, job), { status: "code-pr-opened", updatedAt: now, result: evidence, logs: __spreadArray(__spreadArray([], job.logs, true), [
                { at: now, level: "info", message: "Local Helio Code adapter prepared worker handoff evidence." },
                { at: now, level: "info", message: "Production mode will clone the repo, run the coding agent, checks, and open a GitHub App PR." },
            ], false) });
    };
    var appendJobLog = function (job, level, message) {
        var now = new Date().toISOString();
        return __assign(__assign({}, job), { updatedAt: now, logs: __spreadArray(__spreadArray([], (Array.isArray(job.logs) ? job.logs : []), true), [{ at: now, level: level, message: message }], false) });
    };
    var advanceLocalJobState = function (job) {
        var _a;
        var runningDelay = Number(process.env.HELIO_CODE_DEV_RUNNING_DELAY_MS || 1200);
        var finishDelay = Number(process.env.HELIO_CODE_DEV_FINISH_DELAY_MS || 3800);
        var simulateSuccess = String(process.env.HELIO_CODE_DEV_SIMULATE_SUCCESS || "false").toLowerCase() === "true";
        var startedAt = Number(((_a = job === null || job === void 0 ? void 0 : job.result) === null || _a === void 0 ? void 0 : _a.localLifecycleStartedAt) || Date.parse((job === null || job === void 0 ? void 0 : job.createdAt) || "") || Date.now());
        var elapsed = Date.now() - startedAt;
        var status = String((job === null || job === void 0 ? void 0 : job.status) || "");
        if (status === "code-queued" && elapsed >= runningDelay) {
            return appendJobLog(__assign(__assign({}, job), { status: "code-running" }), "info", "Local adapter: job running. Waiting for real Helio Code worker or simulated completion.");
        }
        if ((status === "code-queued" || status === "code-running") && elapsed >= finishDelay) {
            if (simulateSuccess)
                return localCompleteJob(job);
            return appendJobLog(__assign(__assign({}, job), { status: "code-failed", result: __assign(__assign({}, (job.result || {})), { failureReason: "Local dev adapter does not execute real repo changes by default. Configure production Helio Code worker to open real PRs." }) }), "error", "No production Helio Code worker attached. Marking as failed to avoid false success.");
        }
        return job;
    };
    var scheduleLocalLifecycle = function (jobId) {
        var runningDelay = Number(process.env.HELIO_CODE_DEV_RUNNING_DELAY_MS || 1200);
        var finishDelay = Number(process.env.HELIO_CODE_DEV_FINISH_DELAY_MS || 3800);
        var simulateSuccess = String(process.env.HELIO_CODE_DEV_SIMULATE_SUCCESS || "false").toLowerCase() === "true";
        var t1 = setTimeout(function () {
            var current = jobs.get(jobId);
            if (!current)
                return;
            var next = appendJobLog(__assign(__assign({}, current), { status: "code-running" }), "info", "Local adapter: job running. Waiting for real Helio Code worker or simulated completion.");
            jobs.set(jobId, next);
        }, Math.max(300, runningDelay));
        var t2 = setTimeout(function () {
            var current = jobs.get(jobId);
            if (!current)
                return;
            if (simulateSuccess) {
                var completed = localCompleteJob(current);
                jobs.set(jobId, completed);
                return;
            }
            var failed = appendJobLog(__assign(__assign({}, current), { status: "code-failed", result: __assign(__assign({}, (current.result || {})), { failureReason: "Local dev adapter does not execute real repo changes by default. Configure production Helio Code worker to open real PRs." }) }), "error", "No production Helio Code worker attached. Marking as failed to avoid false success.");
            jobs.set(jobId, failed);
        }, Math.max(1200, finishDelay));
        timers.set(jobId, [t1, t2]);
    };
    var handler = function (req, res, next) { return __awaiter(_this, void 0, void 0, function () {
        var urlObj, method, parts, jobId, _a, _b, _c, _d, _e, _f, payload, created_1, _g, _h, created, queued, job_1, current, job, job_2, job, rows, error_2;
        var _j;
        var _k;
        return __generator(this, function (_l) {
            switch (_l.label) {
                case 0:
                    _l.trys.push([0, 22, , 23]);
                    if (!((_k = req.url) === null || _k === void 0 ? void 0 : _k.startsWith("/api/helio-code/")))
                        return [2 /*return*/, next()];
                    urlObj = new URL(req.url, "http://localhost");
                    method = String(req.method || "GET").toUpperCase();
                    parts = urlObj.pathname.split("/").filter(Boolean);
                    jobId = parts[3] || "";
                    if (!(method === "GET" && urlObj.pathname === "/api/helio-code/readiness")) return [3 /*break*/, 2];
                    _a = sendJson;
                    _b = [res, 200];
                    return [4 /*yield*/, buildHelioCodeReadiness()];
                case 1: return [2 /*return*/, _a.apply(void 0, _b.concat([_l.sent()]))];
                case 2:
                    if (!(method === "POST" && urlObj.pathname === "/api/helio-code/worker/start")) return [3 /*break*/, 4];
                    _c = sendJson;
                    _d = [res, 200];
                    return [4 /*yield*/, startHelioCodeWorker({ cwd: process.cwd() })];
                case 3: return [2 /*return*/, _c.apply(void 0, _d.concat([_l.sent()]))];
                case 4:
                    if (!(method === "GET" && urlObj.pathname === "/api/helio-code/worker/status")) return [3 /*break*/, 6];
                    _e = sendJson;
                    _f = [res, 200];
                    return [4 /*yield*/, getHelioCodeWorkerStatus()];
                case 5: return [2 /*return*/, _e.apply(void 0, _f.concat([_l.sent()]))];
                case 6:
                    if (!(method === "POST" && urlObj.pathname === "/api/helio-code/jobs")) return [3 /*break*/, 12];
                    return [4 /*yield*/, readJsonBody(req)];
                case 7:
                    payload = _l.sent();
                    if (!(dbEnabled() && !memoryFallbackAllowed())) return [3 /*break*/, 11];
                    return [4 /*yield*/, createHelioCodeJob(payload)];
                case 8:
                    created_1 = _l.sent();
                    if (!created_1.ok)
                        return [2 /*return*/, sendJson(res, 400, { ok: false, errors: created_1.errors })];
                    return [4 /*yield*/, appendHelioCodeLog(created_1.job.id, "info", "Job accepted by local Helio API into Neon Postgres queue.", { source: "vite-api" })];
                case 9:
                    _l.sent();
                    _g = sendJson;
                    _h = [res, 202];
                    _j = { ok: true };
                    return [4 /*yield*/, getHelioCodeJob(created_1.job.id)];
                case 10: return [2 /*return*/, _g.apply(void 0, _h.concat([(_j.job = _l.sent(), _j)]))];
                case 11:
                    created = createHelioCodeJobRecord(payload);
                    if (!created.ok)
                        return [2 /*return*/, sendJson(res, 400, { ok: false, errors: created.errors })];
                    queued = appendJobLog(__assign(__assign({}, created.job), { status: "code-queued", result: {
                            mode: "local-dev-adapter",
                            note: "Queued in local adapter. Real PR creation requires production Helio Code worker.",
                            localLifecycleStartedAt: Date.now(),
                        } }), "info", "Local adapter accepted job. Queueing execution lifecycle.");
                    jobs.set(queued.id, queued);
                    scheduleLocalLifecycle(queued.id);
                    return [2 /*return*/, sendJson(res, 202, { ok: true, job: queued })];
                case 12:
                    if (!(method === "GET" && parts[2] === "jobs" && jobId && parts.length === 4)) return [3 /*break*/, 15];
                    if (!(dbEnabled() && !memoryFallbackAllowed())) return [3 /*break*/, 14];
                    return [4 /*yield*/, getHelioCodeJob(jobId)];
                case 13:
                    job_1 = _l.sent();
                    if (!job_1)
                        return [2 /*return*/, sendJson(res, 404, { ok: false, error: "Helio Code job not found" })];
                    return [2 /*return*/, sendJson(res, 200, { ok: true, job: job_1 })];
                case 14:
                    current = jobs.get(jobId);
                    job = current ? advanceLocalJobState(current) : null;
                    if (!job)
                        return [2 /*return*/, sendJson(res, 404, { ok: false, error: "Helio Code job not found" })];
                    if (current !== job)
                        jobs.set(jobId, job);
                    return [2 /*return*/, sendJson(res, 200, { ok: true, job: job })];
                case 15:
                    if (!(method === "GET" && parts[2] === "jobs" && jobId && parts[4] === "events")) return [3 /*break*/, 18];
                    if (!(dbEnabled() && !memoryFallbackAllowed())) return [3 /*break*/, 17];
                    return [4 /*yield*/, getHelioCodeJob(jobId)];
                case 16:
                    job_2 = _l.sent();
                    if (!job_2)
                        return [2 /*return*/, sendJson(res, 404, { ok: false, error: "Helio Code job not found" })];
                    res.statusCode = 200;
                    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
                    res.setHeader("Cache-Control", "no-cache");
                    res.write("event: job\n");
                    res.write("data: ".concat(JSON.stringify(job_2), "\n\n"));
                    res.end();
                    return [2 /*return*/];
                case 17:
                    job = jobs.get(jobId);
                    if (!job)
                        return [2 /*return*/, sendJson(res, 404, { ok: false, error: "Helio Code job not found" })];
                    res.statusCode = 200;
                    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
                    res.setHeader("Cache-Control", "no-cache");
                    res.write("event: job\n");
                    res.write("data: ".concat(JSON.stringify(job), "\n\n"));
                    res.end();
                    return [2 /*return*/];
                case 18:
                    if (!(method === "GET" && urlObj.pathname === "/api/helio-code/jobs")) return [3 /*break*/, 21];
                    if (!(dbEnabled() && !memoryFallbackAllowed())) return [3 /*break*/, 20];
                    return [4 /*yield*/, listHelioCodeJobs({
                            orgId: String(urlObj.searchParams.get("orgId") || ""),
                            missionId: String(urlObj.searchParams.get("missionId") || ""),
                            limit: Number(urlObj.searchParams.get("limit") || 50),
                        })];
                case 19:
                    rows = _l.sent();
                    return [2 /*return*/, sendJson(res, 200, { ok: true, jobs: rows })];
                case 20: return [2 /*return*/, sendJson(res, 200, { ok: true, jobs: Array.from(jobs.values()) })];
                case 21: return [2 /*return*/, sendJson(res, 405, { ok: false, error: "Method not allowed" })];
                case 22:
                    error_2 = _l.sent();
                    return [2 /*return*/, sendJson(res, 500, { ok: false, error: (error_2 === null || error_2 === void 0 ? void 0 : error_2.message) || "Internal error" })];
                case 23: return [2 /*return*/];
            }
        });
    }); };
    return {
        name: "helio-code-api",
        configureServer: function (server) {
            server.middlewares.use(handler);
        },
        configurePreviewServer: function (server) {
            server.middlewares.use(handler);
        },
    };
}
function dataForSeoApi() {
    var _this = this;
    var handler = function (req, res, next) { return __awaiter(_this, void 0, void 0, function () {
        var _a;
        return __generator(this, function (_b) {
            if (!((_a = req.url) === null || _a === void 0 ? void 0 : _a.startsWith("/api/dataforseo/backlinks")))
                return [2 /*return*/, next()];
            return [2 /*return*/, handleDataForSeoBacklinks(req, res)];
        });
    }); };
    return {
        name: "helio-dataforseo-api",
        configureServer: function (server) {
            server.middlewares.use(handler);
        },
        configurePreviewServer: function (server) {
            server.middlewares.use(handler);
        },
    };
}
function helioBacklinkApi() {
    var _this = this;
    var handler = function (req, res, next) { return __awaiter(_this, void 0, void 0, function () {
        var _a;
        return __generator(this, function (_b) {
            if (!((_a = req.url) === null || _a === void 0 ? void 0 : _a.startsWith("/api/helio-backlinks/analyze")))
                return [2 /*return*/, next()];
            return [2 /*return*/, handleHelioBacklinkAnalysis(req, res)];
        });
    }); };
    return {
        name: "helio-native-backlink-api",
        configureServer: function (server) {
            server.middlewares.use(handler);
        },
        configurePreviewServer: function (server) {
            server.middlewares.use(handler);
        },
    };
}
function approvalChannelApi() {
    var _this = this;
    var htmlEscape = function (value) {
        return String(value || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    };
    var sendHtml = function (res, status, html) {
        res.statusCode = status;
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.end(html);
    };
    var getPublicBaseUrl = function (req, body) {
        var _a, _b;
        var configured = String(process.env.HELIO_PUBLIC_URL || (body === null || body === void 0 ? void 0 : body.publicUrl) || "").trim().replace(/\/+$/, "");
        if (configured)
            return configured;
        var dashboardUrl = String((body === null || body === void 0 ? void 0 : body.dashboardUrl) || "").trim();
        if (dashboardUrl) {
            try {
                var parsed = new URL(dashboardUrl);
                return parsed.origin;
            }
            catch (_c) {
                // Fall through to request host.
            }
        }
        var host = String(((_a = req.headers) === null || _a === void 0 ? void 0 : _a.host) || "127.0.0.1:5050");
        var proto = String(((_b = req.headers) === null || _b === void 0 ? void 0 : _b["x-forwarded-proto"]) || "http").split(",")[0];
        return "".concat(proto, "://").concat(host);
    };
    var postJson = function (url, payload) { return __awaiter(_this, void 0, void 0, function () {
        var res, text;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, fetch(url, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(payload),
                    })];
                case 1:
                    res = _a.sent();
                    return [4 /*yield*/, res.text().catch(function () { return ""; })];
                case 2:
                    text = _a.sent();
                    if (!res.ok)
                        throw new Error(text || "Webhook HTTP ".concat(res.status));
                    return [2 /*return*/, text];
            }
        });
    }); };
    var handler = function (req, res, next) { return __awaiter(_this, void 0, void 0, function () {
        var urlObj, method, token_1, decision, record, decided, label, dashboardUrl_1, orgId, host, decisions, body, provider, webhookUrl, title, message, dashboardUrl, approval, token, baseUrl, approveUrl, rejectUrl, error_3;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 13, , 14]);
                    if (!((_a = req.url) === null || _a === void 0 ? void 0 : _a.startsWith("/api/approval-channel/")))
                        return [2 /*return*/, next()];
                    urlObj = new URL(req.url, "http://localhost");
                    method = String(req.method || "").toUpperCase();
                    if (!(method === "GET" && urlObj.pathname === "/api/approval-channel/respond")) return [3 /*break*/, 3];
                    token_1 = String(urlObj.searchParams.get("token") || "");
                    decision = String(urlObj.searchParams.get("decision") || "").toLowerCase();
                    if (!token_1 || !["approve", "reject"].includes(decision)) {
                        return [2 /*return*/, sendHtml(res, 400, "<h1>Invalid Helio approval link</h1><p>The approval token or decision is missing.</p>")];
                    }
                    return [4 /*yield*/, getApprovalRequest(token_1).catch(function () { return null; })];
                case 1:
                    record = _b.sent();
                    if (!record) {
                        return [2 /*return*/, sendHtml(res, 404, "<h1>Approval request not found</h1><p>This approval link is invalid or expired.</p>")];
                    }
                    return [4 /*yield*/, decideApprovalRequest(token_1, decision)];
                case 2:
                    decided = _b.sent();
                    label = decided.status === "approved" ? "approved" : decided.status === "rejected" ? "rejected" : "already decided";
                    dashboardUrl_1 = String(decided.dashboardUrl || "".concat(getPublicBaseUrl(req), "/dashboard"));
                    return [2 /*return*/, sendHtml(res, 200, "<!doctype html>\n          <html><head><meta charset=\"utf-8\"/><title>Helio approval ".concat(htmlEscape(label), "</title>\n          <style>body{background:#070807;color:#d7d7d7;font-family:ui-monospace,Menlo,monospace;padding:40px}a{color:#caff3d}.box{border:1px solid #9fd24a;padding:24px;max-width:760px}</style></head>\n          <body><div class=\"box\"><h1>Helio deployment ").concat(htmlEscape(label), "</h1>\n          <p><strong>Action:</strong> ").concat(htmlEscape(String(decided.actionLabel || decided.title || "Deployment action")), "</p>\n          <p><strong>Detail:</strong> ").concat(htmlEscape(String(decided.actionDetail || decided.message || "")), "</p>\n          <p><strong>Decision time:</strong> ").concat(htmlEscape(String(decided.decidedAt || "pending")), "</p>\n          <p><a href=\"").concat(htmlEscape(dashboardUrl_1), "\">Return to Helio Dashboard</a></p></div></body></html>"))];
                case 3:
                    if (!(method === "GET" && urlObj.pathname === "/api/approval-channel/decisions")) return [3 /*break*/, 5];
                    orgId = String(urlObj.searchParams.get("orgId") || "");
                    host = String(urlObj.searchParams.get("host") || "");
                    return [4 /*yield*/, listApprovalRequests({ orgId: orgId, host: host })];
                case 4:
                    decisions = _b.sent();
                    return [2 /*return*/, sendJson(res, 200, { ok: true, decisions: decisions })];
                case 5:
                    if (method !== "POST" || urlObj.pathname !== "/api/approval-channel/send")
                        return [2 /*return*/, sendJson(res, 405, { ok: false, error: "Method not allowed" })];
                    return [4 /*yield*/, readJsonBody(req)];
                case 6:
                    body = _b.sent();
                    provider = String((body === null || body === void 0 ? void 0 : body.provider) || "").toLowerCase();
                    webhookUrl = String((body === null || body === void 0 ? void 0 : body.webhookUrl) || "").trim();
                    title = String((body === null || body === void 0 ? void 0 : body.title) || "Helio approval request").trim();
                    message = String((body === null || body === void 0 ? void 0 : body.message) || "").trim();
                    dashboardUrl = String((body === null || body === void 0 ? void 0 : body.dashboardUrl) || "http://localhost:5050/dashboard").trim();
                    approval = (body === null || body === void 0 ? void 0 : body.approval) || {};
                    if (!["slack", "discord"].includes(provider))
                        return [2 /*return*/, sendJson(res, 400, { ok: false, error: "Unsupported approval provider" })];
                    if (!/^https:\/\//i.test(webhookUrl))
                        return [2 /*return*/, sendJson(res, 400, { ok: false, error: "Valid HTTPS webhookUrl is required" })];
                    token = (approval === null || approval === void 0 ? void 0 : approval.actionId) ? createApprovalToken() : "";
                    baseUrl = getPublicBaseUrl(req, body);
                    approveUrl = token ? "".concat(baseUrl, "/api/approval-channel/respond?token=").concat(encodeURIComponent(token), "&decision=approve") : "";
                    rejectUrl = token ? "".concat(baseUrl, "/api/approval-channel/respond?token=").concat(encodeURIComponent(token), "&decision=reject") : "";
                    if (!token) return [3 /*break*/, 8];
                    return [4 /*yield*/, saveApprovalRequest({
                            token: token,
                            provider: provider,
                            orgId: String(approval.orgId || "default"),
                            host: String(approval.host || ""),
                            actionId: String(approval.actionId || ""),
                            actionLabel: String(approval.actionLabel || ""),
                            actionDetail: String(approval.actionDetail || ""),
                            title: title,
                            message: message,
                            dashboardUrl: dashboardUrl,
                            status: "pending",
                            decision: "",
                            requestedAt: new Date().toISOString(),
                            decidedAt: "",
                        })];
                case 7:
                    _b.sent();
                    _b.label = 8;
                case 8:
                    if (!(provider === "slack")) return [3 /*break*/, 10];
                    return [4 /*yield*/, postJson(webhookUrl, {
                            text: token ? "".concat(title, "\n").concat(message, "\nApprove: ").concat(approveUrl, "\nReject: ").concat(rejectUrl) : "".concat(title, "\n").concat(message, "\nOpen Helio: ").concat(dashboardUrl),
                            blocks: [
                                { type: "header", text: { type: "plain_text", text: title.slice(0, 140) } },
                                { type: "section", text: { type: "mrkdwn", text: message.slice(0, 2800) } },
                                token
                                    ? { type: "actions", elements: [
                                            { type: "button", text: { type: "plain_text", text: "Approve" }, style: "primary", url: approveUrl },
                                            { type: "button", text: { type: "plain_text", text: "Reject" }, style: "danger", url: rejectUrl },
                                            { type: "button", text: { type: "plain_text", text: "Open Helio" }, url: dashboardUrl },
                                        ] }
                                    : { type: "section", text: { type: "mrkdwn", text: "Open Helio to approve or reject: ".concat(dashboardUrl) } },
                            ],
                        })];
                case 9:
                    _b.sent();
                    return [3 /*break*/, 12];
                case 10: return [4 /*yield*/, postJson(webhookUrl, {
                        content: token ? "**".concat(title, "**\n").concat(message, "\nUse the buttons below to approve or reject.") : "**".concat(title, "**\n").concat(message, "\nOpen Helio to approve or reject: ").concat(dashboardUrl),
                        components: token ? [{
                                type: 1,
                                components: [
                                    { type: 2, style: 5, label: "Approve", url: approveUrl },
                                    { type: 2, style: 5, label: "Reject", url: rejectUrl },
                                    { type: 2, style: 5, label: "Open Helio", url: dashboardUrl },
                                ],
                            }] : undefined,
                    })];
                case 11:
                    _b.sent();
                    _b.label = 12;
                case 12: return [2 /*return*/, sendJson(res, 200, { ok: true, token: token, approveUrl: approveUrl, rejectUrl: rejectUrl })];
                case 13:
                    error_3 = _b.sent();
                    return [2 /*return*/, sendJson(res, 500, { ok: false, error: (error_3 === null || error_3 === void 0 ? void 0 : error_3.message) || "Failed to send approval request" })];
                case 14: return [2 /*return*/];
            }
        });
    }); };
    return {
        name: "helio-approval-channel-api",
        configureServer: function (server) {
            server.middlewares.use(handler);
        },
        configurePreviewServer: function (server) {
            server.middlewares.use(handler);
        },
    };
}
function aeoIntelligenceApi() {
    var _this = this;
    var extractUrls = function (text) {
        var out = new Set();
        var re = /https?:\/\/[^\s)\]}>"']+/gi;
        var m;
        while ((m = re.exec(String(text || ""))))
            out.add(m[0]);
        return Array.from(out);
    };
    var sleep = function (ms) { return new Promise(function (resolve) { return setTimeout(resolve, ms); }); };
    var fetchWithRetry = function (url_1, init_1) {
        var args_1 = [];
        for (var _i = 2; _i < arguments.length; _i++) {
            args_1[_i - 2] = arguments[_i];
        }
        return __awaiter(_this, __spreadArray([url_1, init_1], args_1, true), void 0, function (url, init, retries, timeoutMs) {
            var lastError, _loop_1, attempt, state_1;
            if (retries === void 0) { retries = 2; }
            if (timeoutMs === void 0) { timeoutMs = 12000; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        lastError = null;
                        _loop_1 = function (attempt) {
                            var controller, timer, started, res, latencyMs, e_2;
                            return __generator(this, function (_b) {
                                switch (_b.label) {
                                    case 0:
                                        controller = new AbortController();
                                        timer = setTimeout(function () { return controller.abort(); }, timeoutMs);
                                        started = Date.now();
                                        _b.label = 1;
                                    case 1:
                                        _b.trys.push([1, 5, , 8]);
                                        return [4 /*yield*/, fetch(url, __assign(__assign({}, (init || {})), { signal: controller.signal }))];
                                    case 2:
                                        res = _b.sent();
                                        clearTimeout(timer);
                                        latencyMs = Date.now() - started;
                                        if (!(!res.ok && (res.status === 429 || res.status >= 500) && attempt < retries)) return [3 /*break*/, 4];
                                        return [4 /*yield*/, sleep(250 * (attempt + 1))];
                                    case 3:
                                        _b.sent();
                                        return [2 /*return*/, "continue"];
                                    case 4: return [2 /*return*/, { value: { res: res, latencyMs: latencyMs, attempts: attempt + 1 } }];
                                    case 5:
                                        e_2 = _b.sent();
                                        clearTimeout(timer);
                                        lastError = e_2;
                                        if (!(attempt < retries)) return [3 /*break*/, 7];
                                        return [4 /*yield*/, sleep(250 * (attempt + 1))];
                                    case 6:
                                        _b.sent();
                                        return [2 /*return*/, "continue"];
                                    case 7: return [3 /*break*/, 8];
                                    case 8: return [2 /*return*/];
                                }
                            });
                        };
                        attempt = 0;
                        _a.label = 1;
                    case 1:
                        if (!(attempt <= retries)) return [3 /*break*/, 4];
                        return [5 /*yield**/, _loop_1(attempt)];
                    case 2:
                        state_1 = _a.sent();
                        if (typeof state_1 === "object")
                            return [2 /*return*/, state_1.value];
                        _a.label = 3;
                    case 3:
                        attempt += 1;
                        return [3 /*break*/, 1];
                    case 4: throw lastError || new Error("Request failed");
                }
            });
        });
    };
    var handler = function (req, res, next) { return __awaiter(_this, void 0, void 0, function () {
        var urlObj, method, body, prompt_1, targetHost_1, connectors, observations_1, errors, connectorStats, add, _a, r, latencyMs, attempts, d, text, e_3, _b, r, latencyMs, attempts, d, text, e_4, _c, r, latencyMs, attempts, d, text, e_5, endpoint, _d, r, latencyMs, attempts, d, rows, _i, rows_1, row, q, e_6, error_4;
        var _e, _f, _g, _h, _j, _k, _l;
        return __generator(this, function (_m) {
            switch (_m.label) {
                case 0:
                    _m.trys.push([0, 22, , 23]);
                    if (!((_e = req.url) === null || _e === void 0 ? void 0 : _e.startsWith("/api/aeo/intel")))
                        return [2 /*return*/, next()];
                    urlObj = new URL(req.url, "http://localhost");
                    method = String(req.method || "GET").toUpperCase();
                    if (method !== "POST" || urlObj.pathname !== "/api/aeo/intel") {
                        return [2 /*return*/, sendJson(res, 405, { ok: false, error: "Method not allowed" })];
                    }
                    return [4 /*yield*/, readJsonBody(req)];
                case 1:
                    body = _m.sent();
                    prompt_1 = String((body === null || body === void 0 ? void 0 : body.prompt) || "").trim();
                    targetHost_1 = String((body === null || body === void 0 ? void 0 : body.targetHost) || "").toLowerCase();
                    connectors = (body === null || body === void 0 ? void 0 : body.connectors) || {};
                    if (!prompt_1)
                        return [2 /*return*/, sendJson(res, 400, { ok: false, error: "Missing prompt" })];
                    observations_1 = [];
                    errors = [];
                    connectorStats = {};
                    add = function (engine, text, urls, status) {
                        var cited = !!targetHost_1 && urls.some(function (u) { return String(u || "").toLowerCase().includes(targetHost_1); });
                        observations_1.push({
                            engine: engine,
                            prompt: prompt_1,
                            cited: cited,
                            citationUrl: urls[0] || "",
                            citations: urls.slice(0, 8),
                            rank: cited ? 3 : null,
                            sentiment: cited ? "positive" : "neutral",
                            outcomeStatus: status,
                            observedAt: new Date().toISOString(),
                            rawPreview: String(text || "").slice(0, 500),
                        });
                    };
                    if (!(connectors === null || connectors === void 0 ? void 0 : connectors.openaiSearchKey)) return [3 /*break*/, 6];
                    _m.label = 2;
                case 2:
                    _m.trys.push([2, 5, , 6]);
                    return [4 /*yield*/, fetchWithRetry("https://api.openai.com/v1/responses", {
                            method: "POST",
                            headers: { "Content-Type": "application/json", Authorization: "Bearer ".concat(connectors.openaiSearchKey) },
                            body: JSON.stringify({ model: "gpt-4.1-mini", input: prompt_1, tools: [{ type: "web_search_preview" }] }),
                        })];
                case 3:
                    _a = _m.sent(), r = _a.res, latencyMs = _a.latencyMs, attempts = _a.attempts;
                    return [4 /*yield*/, r.json().catch(function () { return ({}); })];
                case 4:
                    d = _m.sent();
                    connectorStats.chatgpt = { latencyMs: latencyMs, attempts: attempts, status: r.status };
                    text = String((d === null || d === void 0 ? void 0 : d.output_text) || JSON.stringify((d === null || d === void 0 ? void 0 : d.output) || d || ""));
                    add("chatgpt", text, extractUrls(text), r.ok ? "ok" : "error");
                    if (!r.ok)
                        errors.push({ engine: "chatgpt", status: r.status, message: ((_f = d === null || d === void 0 ? void 0 : d.error) === null || _f === void 0 ? void 0 : _f.message) || "OpenAI request failed" });
                    return [3 /*break*/, 6];
                case 5:
                    e_3 = _m.sent();
                    errors.push({ engine: "chatgpt", message: (e_3 === null || e_3 === void 0 ? void 0 : e_3.message) || "OpenAI probe error" });
                    return [3 /*break*/, 6];
                case 6:
                    if (!(connectors === null || connectors === void 0 ? void 0 : connectors.anthropicSearchKey)) return [3 /*break*/, 11];
                    _m.label = 7;
                case 7:
                    _m.trys.push([7, 10, , 11]);
                    return [4 /*yield*/, fetchWithRetry("https://api.anthropic.com/v1/messages", {
                            method: "POST",
                            headers: { "Content-Type": "application/json", "x-api-key": connectors.anthropicSearchKey, "anthropic-version": "2023-06-01" },
                            body: JSON.stringify({ model: "claude-sonnet-4-5", max_tokens: 1000, messages: [{ role: "user", content: prompt_1 }] }),
                        })];
                case 8:
                    _b = _m.sent(), r = _b.res, latencyMs = _b.latencyMs, attempts = _b.attempts;
                    return [4 /*yield*/, r.json().catch(function () { return ({}); })];
                case 9:
                    d = _m.sent();
                    connectorStats.claude = { latencyMs: latencyMs, attempts: attempts, status: r.status };
                    text = JSON.stringify((d === null || d === void 0 ? void 0 : d.content) || d || "");
                    add("claude", text, extractUrls(text), r.ok ? "ok" : "error");
                    if (!r.ok)
                        errors.push({ engine: "claude", status: r.status, message: ((_g = d === null || d === void 0 ? void 0 : d.error) === null || _g === void 0 ? void 0 : _g.message) || "Anthropic request failed" });
                    return [3 /*break*/, 11];
                case 10:
                    e_4 = _m.sent();
                    errors.push({ engine: "claude", message: (e_4 === null || e_4 === void 0 ? void 0 : e_4.message) || "Anthropic probe error" });
                    return [3 /*break*/, 11];
                case 11:
                    if (!(connectors === null || connectors === void 0 ? void 0 : connectors.perplexityKey)) return [3 /*break*/, 16];
                    _m.label = 12;
                case 12:
                    _m.trys.push([12, 15, , 16]);
                    return [4 /*yield*/, fetchWithRetry("https://api.perplexity.ai/chat/completions", {
                            method: "POST",
                            headers: { "Content-Type": "application/json", Authorization: "Bearer ".concat(connectors.perplexityKey) },
                            body: JSON.stringify({ model: "sonar", messages: [{ role: "user", content: prompt_1 }] }),
                        })];
                case 13:
                    _c = _m.sent(), r = _c.res, latencyMs = _c.latencyMs, attempts = _c.attempts;
                    return [4 /*yield*/, r.json().catch(function () { return ({}); })];
                case 14:
                    d = _m.sent();
                    connectorStats.perplexity = { latencyMs: latencyMs, attempts: attempts, status: r.status };
                    text = String(((_k = (_j = (_h = d === null || d === void 0 ? void 0 : d.choices) === null || _h === void 0 ? void 0 : _h[0]) === null || _j === void 0 ? void 0 : _j.message) === null || _k === void 0 ? void 0 : _k.content) || JSON.stringify(d || ""));
                    add("perplexity", text, extractUrls(text), r.ok ? "ok" : "error");
                    if (!r.ok)
                        errors.push({ engine: "perplexity", status: r.status, message: ((_l = d === null || d === void 0 ? void 0 : d.error) === null || _l === void 0 ? void 0 : _l.message) || "Perplexity request failed" });
                    return [3 /*break*/, 16];
                case 15:
                    e_5 = _m.sent();
                    errors.push({ engine: "perplexity", message: (e_5 === null || e_5 === void 0 ? void 0 : e_5.message) || "Perplexity probe error" });
                    return [3 /*break*/, 16];
                case 16:
                    if (!((connectors === null || connectors === void 0 ? void 0 : connectors.bingApiKey) && (connectors === null || connectors === void 0 ? void 0 : connectors.bingSiteUrl))) return [3 /*break*/, 21];
                    _m.label = 17;
                case 17:
                    _m.trys.push([17, 20, , 21]);
                    endpoint = "https://ssl.bing.com/webmaster/api.svc/json/GetQueryStats?apikey=".concat(encodeURIComponent(connectors.bingApiKey), "&siteUrl=").concat(encodeURIComponent(connectors.bingSiteUrl));
                    return [4 /*yield*/, fetchWithRetry(endpoint, {}, 2, 12000)];
                case 18:
                    _d = _m.sent(), r = _d.res, latencyMs = _d.latencyMs, attempts = _d.attempts;
                    return [4 /*yield*/, r.json().catch(function () { return ({}); })];
                case 19:
                    d = _m.sent();
                    connectorStats.copilot = { latencyMs: latencyMs, attempts: attempts, status: r.status };
                    rows = Array.isArray(d === null || d === void 0 ? void 0 : d.d) ? d.d.slice(0, 20) : [];
                    for (_i = 0, rows_1 = rows; _i < rows_1.length; _i++) {
                        row = rows_1[_i];
                        q = String((row === null || row === void 0 ? void 0 : row.Query) || (row === null || row === void 0 ? void 0 : row.query) || "");
                        if (!q)
                            continue;
                        observations_1.push({
                            engine: "copilot",
                            prompt: q,
                            cited: true,
                            citationUrl: "",
                            citations: [],
                            rank: null,
                            sentiment: "neutral",
                            outcomeStatus: r.ok ? "ok" : "error",
                            observedAt: new Date().toISOString(),
                            rawPreview: "",
                        });
                    }
                    if (!r.ok)
                        errors.push({ engine: "copilot", status: r.status, message: (d === null || d === void 0 ? void 0 : d.Message) || "Bing query stats failed" });
                    return [3 /*break*/, 21];
                case 20:
                    e_6 = _m.sent();
                    errors.push({ engine: "copilot", message: (e_6 === null || e_6 === void 0 ? void 0 : e_6.message) || "Bing probe error" });
                    return [3 /*break*/, 21];
                case 21: return [2 /*return*/, sendJson(res, 200, { ok: true, observations: observations_1, errors: errors, connectorStats: connectorStats })];
                case 22:
                    error_4 = _m.sent();
                    return [2 /*return*/, sendJson(res, 500, { ok: false, error: (error_4 === null || error_4 === void 0 ? void 0 : error_4.message) || "Internal error" })];
                case 23: return [2 /*return*/];
            }
        });
    }); };
    return {
        name: "helio-aeo-intel-api",
        configureServer: function (server) {
            server.middlewares.use(handler);
        },
        configurePreviewServer: function (server) {
            server.middlewares.use(handler);
        },
    };
}
function modelCatalogApi() {
    var _this = this;
    var handler = function (req, res, next) { return __awaiter(_this, void 0, void 0, function () {
        var urlObj, method, body, provider, apiKey, action, model, normalize, tr, td, r, d, tr, td, r, d, tr, td, r, d, error_5;
        var _a, _b, _c, _d, _e, _f, _g;
        return __generator(this, function (_h) {
            switch (_h.label) {
                case 0:
                    _h.trys.push([0, 20, , 21]);
                    if (!((_a = req.url) === null || _a === void 0 ? void 0 : _a.startsWith("/api/model-catalog")))
                        return [2 /*return*/, next()];
                    urlObj = new URL(req.url, "http://localhost");
                    method = String(req.method || "GET").toUpperCase();
                    if (method !== "POST" || urlObj.pathname !== "/api/model-catalog") {
                        return [2 /*return*/, sendJson(res, 405, { ok: false, error: "Method not allowed" })];
                    }
                    return [4 /*yield*/, readJsonBody(req)];
                case 1:
                    body = _h.sent();
                    provider = String((body === null || body === void 0 ? void 0 : body.provider) || "").toLowerCase();
                    apiKey = String((body === null || body === void 0 ? void 0 : body.apiKey) || "");
                    action = String((body === null || body === void 0 ? void 0 : body.action) || "list").toLowerCase();
                    model = String((body === null || body === void 0 ? void 0 : body.model) || "");
                    if (!provider || !apiKey)
                        return [2 /*return*/, sendJson(res, 400, { ok: false, error: "provider and apiKey are required" })];
                    normalize = function (rows) {
                        if (rows === void 0) { rows = []; }
                        return rows
                            .map(function (m) { return ({
                            id: String((m === null || m === void 0 ? void 0 : m.id) || ""),
                            name: String((m === null || m === void 0 ? void 0 : m.name) || (m === null || m === void 0 ? void 0 : m.display_name) || (m === null || m === void 0 ? void 0 : m.id) || ""),
                            ctx: (m === null || m === void 0 ? void 0 : m.context_length) ? String(m.context_length) : "?",
                            price: "Live",
                        }); })
                            .filter(function (m) { return m.id; });
                    };
                    if (!(provider === "openrouter")) return [3 /*break*/, 7];
                    if (!(action === "test")) return [3 /*break*/, 4];
                    return [4 /*yield*/, fetch("https://openrouter.ai/api/v1/chat/completions", {
                            method: "POST",
                            headers: {
                                "Content-Type": "application/json",
                                Authorization: "Bearer ".concat(apiKey),
                                "HTTP-Referer": "https://helio-seo.app",
                                "X-Title": "Helio",
                            },
                            body: JSON.stringify({
                                model: model || "openai/gpt-4o-mini",
                                messages: [{ role: "user", content: "ping" }],
                                max_tokens: 5,
                            }),
                        })];
                case 2:
                    tr = _h.sent();
                    return [4 /*yield*/, tr.json().catch(function () { return ({}); })];
                case 3:
                    td = _h.sent();
                    if (!tr.ok)
                        return [2 /*return*/, sendJson(res, tr.status || 500, { ok: false, error: ((_b = td === null || td === void 0 ? void 0 : td.error) === null || _b === void 0 ? void 0 : _b.message) || "OpenRouter HTTP ".concat(tr.status) })];
                    return [2 /*return*/, sendJson(res, 200, { ok: true, testedModel: model || "openai/gpt-4o-mini" })];
                case 4: return [4 /*yield*/, fetch("https://openrouter.ai/api/v1/models", { headers: { Authorization: "Bearer ".concat(apiKey) } })];
                case 5:
                    r = _h.sent();
                    return [4 /*yield*/, r.json().catch(function () { return ({}); })];
                case 6:
                    d = _h.sent();
                    if (!r.ok)
                        return [2 /*return*/, sendJson(res, r.status || 500, { ok: false, error: ((_c = d === null || d === void 0 ? void 0 : d.error) === null || _c === void 0 ? void 0 : _c.message) || "OpenRouter HTTP ".concat(r.status) })];
                    return [2 /*return*/, sendJson(res, 200, { ok: true, models: normalize(Array.isArray(d === null || d === void 0 ? void 0 : d.data) ? d.data : []) })];
                case 7:
                    if (!(provider === "openai")) return [3 /*break*/, 13];
                    if (!(action === "test")) return [3 /*break*/, 10];
                    return [4 /*yield*/, fetch("https://api.openai.com/v1/chat/completions", {
                            method: "POST",
                            headers: { "Content-Type": "application/json", Authorization: "Bearer ".concat(apiKey) },
                            body: JSON.stringify({
                                model: model || "gpt-4o-mini",
                                messages: [{ role: "user", content: "ping" }],
                                max_tokens: 5,
                            }),
                        })];
                case 8:
                    tr = _h.sent();
                    return [4 /*yield*/, tr.json().catch(function () { return ({}); })];
                case 9:
                    td = _h.sent();
                    if (!tr.ok)
                        return [2 /*return*/, sendJson(res, tr.status || 500, { ok: false, error: ((_d = td === null || td === void 0 ? void 0 : td.error) === null || _d === void 0 ? void 0 : _d.message) || "OpenAI HTTP ".concat(tr.status) })];
                    return [2 /*return*/, sendJson(res, 200, { ok: true, testedModel: model || "gpt-4o-mini" })];
                case 10: return [4 /*yield*/, fetch("https://api.openai.com/v1/models", { headers: { Authorization: "Bearer ".concat(apiKey) } })];
                case 11:
                    r = _h.sent();
                    return [4 /*yield*/, r.json().catch(function () { return ({}); })];
                case 12:
                    d = _h.sent();
                    if (!r.ok)
                        return [2 /*return*/, sendJson(res, r.status || 500, { ok: false, error: ((_e = d === null || d === void 0 ? void 0 : d.error) === null || _e === void 0 ? void 0 : _e.message) || "OpenAI HTTP ".concat(r.status) })];
                    return [2 /*return*/, sendJson(res, 200, { ok: true, models: normalize(Array.isArray(d === null || d === void 0 ? void 0 : d.data) ? d.data : []) })];
                case 13:
                    if (!(provider === "anthropic")) return [3 /*break*/, 19];
                    if (!(action === "test")) return [3 /*break*/, 16];
                    return [4 /*yield*/, fetch("https://api.anthropic.com/v1/messages", {
                            method: "POST",
                            headers: {
                                "Content-Type": "application/json",
                                "x-api-key": apiKey,
                                "anthropic-version": "2023-06-01",
                            },
                            body: JSON.stringify({
                                model: model || "claude-sonnet-4-5",
                                max_tokens: 8,
                                messages: [{ role: "user", content: "ping" }],
                            }),
                        })];
                case 14:
                    tr = _h.sent();
                    return [4 /*yield*/, tr.json().catch(function () { return ({}); })];
                case 15:
                    td = _h.sent();
                    if (!tr.ok)
                        return [2 /*return*/, sendJson(res, tr.status || 500, { ok: false, error: ((_f = td === null || td === void 0 ? void 0 : td.error) === null || _f === void 0 ? void 0 : _f.message) || "Anthropic HTTP ".concat(tr.status) })];
                    return [2 /*return*/, sendJson(res, 200, { ok: true, testedModel: model || "claude-sonnet-4-5" })];
                case 16: return [4 /*yield*/, fetch("https://api.anthropic.com/v1/models", {
                        headers: {
                            "x-api-key": apiKey,
                            "anthropic-version": "2023-06-01",
                        },
                    })];
                case 17:
                    r = _h.sent();
                    return [4 /*yield*/, r.json().catch(function () { return ({}); })];
                case 18:
                    d = _h.sent();
                    if (!r.ok)
                        return [2 /*return*/, sendJson(res, r.status || 500, { ok: false, error: ((_g = d === null || d === void 0 ? void 0 : d.error) === null || _g === void 0 ? void 0 : _g.message) || "Anthropic HTTP ".concat(r.status) })];
                    return [2 /*return*/, sendJson(res, 200, { ok: true, models: normalize(Array.isArray(d === null || d === void 0 ? void 0 : d.data) ? d.data : []) })];
                case 19: return [2 /*return*/, sendJson(res, 400, { ok: false, error: "Unsupported provider" })];
                case 20:
                    error_5 = _h.sent();
                    return [2 /*return*/, sendJson(res, 500, { ok: false, error: (error_5 === null || error_5 === void 0 ? void 0 : error_5.message) || "Failed to load model catalog" })];
                case 21: return [2 /*return*/];
            }
        });
    }); };
    return {
        name: "helio-model-catalog-api",
        configureServer: function (server) {
            server.middlewares.use(handler);
        },
        configurePreviewServer: function (server) {
            server.middlewares.use(handler);
        },
    };
}
export default defineConfig({
    plugins: [react(), helioAuditReportApi(), helioCodeApi(), dataForSeoApi(), helioBacklinkApi(), approvalChannelApi(), aeoIntelligenceApi(), modelCatalogApi()],
    build: {
        chunkSizeWarningLimit: 650,
        rollupOptions: {
            output: {
                manualChunks: function (id) {
                    if (!id.includes("node_modules"))
                        return;
                    if (id.includes("jspdf"))
                        return "vendor-jspdf";
                    if (id.includes("html2canvas"))
                        return "vendor-html2canvas";
                    if (id.includes("react"))
                        return "vendor-react";
                },
            },
        },
    },
    server: {
        port: 5050,
        strictPort: true,
    },
    preview: {
        port: 5050,
        strictPort: true,
    },
});

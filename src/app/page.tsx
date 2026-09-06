"use client";

import { ChangeEvent, DragEvent, useEffect, useState } from "react";

type Job = {
  title: string;
  company: string;
  location: string;
  workType: string;
  salary?: string;
  score: number;
  analysis: string;
  url: string;
  skills: string[];
  missingSkills: string[];
  snippet?: string;
};

type DeepMatch = {
  score: number;
  cultureAnalysis: string;
  matchedSkills: string[];
  missingSkills: string[];
  recommendation: string;
  tailoredBulletPoint: string;
};

const WORK_TYPES = ["Remote", "Hybrid", "On-site"];

export default function Home() {
  const [resume, setResume] = useState("");
  const [fileName, setFileName] = useState("");
  const [uploadingCV, setUploadingCV] = useState(false);

  const [keyword, setKeyword] = useState("Frontend Developer");
  const [location, setLocation] = useState("Lahore, Pakistan");
  const [workTypes, setWorkTypes] = useState<string[]>(["Remote"]);
  const [experience, setExperience] = useState("Any");
  const [companyType, setCompanyType] = useState("any");

  const [keywords, setKeywords] = useState([
    "React",
    "Next.js",
    "TypeScript",
  ]);
  const [keywordInput, setKeywordInput] = useState("");
  const [maxResults, setMaxResults] = useState(6);

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [jobsList, setJobsList] = useState<Job[]>([]);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [savedJobs, setSavedJobs] = useState<string[]>([]);

  const [deepMatch, setDeepMatch] = useState<DeepMatch | null>(null);
  const [deepMatchLoading, setDeepMatchLoading] = useState(false);
  const [deepMatchError, setDeepMatchError] = useState("");

  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [error, setError] = useState("");

  const loadingStages = [
    "Reading your CV...",
    "Searching the web for relevant jobs...",
    "Filtering duplicate listings...",
    "Analyzing jobs with AI...",
    "Ranking your best matches...",
  ];

  const toggleWorkType = (type: string) => {
    setWorkTypes((current) =>
      current.includes(type)
        ? current.filter((item) => item !== type)
        : [...current, type]
    );
  };

  const addKeyword = () => {
    const value = keywordInput.trim();

    if (!value || keywords.includes(value)) {
      setKeywordInput("");
      return;
    }

    setKeywords((current) => [...current, value]);
    setKeywordInput("");
  };

  const removeKeyword = (value: string) => {
    setKeywords((current) => current.filter((item) => item !== value));
  };

  const handleFile = async (file: File) => {
    setError("");

    const allowedExtensions = [".pdf", ".docx", ".html", ".htm", ".txt"];
    const lowerName = file.name.toLowerCase();

    const validExtension = allowedExtensions.some((extension) =>
      lowerName.endsWith(extension)
    );

    if (!validExtension) {
      setError("Please upload a PDF, DOCX, HTML, or TXT CV.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError("CV file must be smaller than 5MB.");
      return;
    }

    setUploadingCV(true);
    setFileName(file.name);
    setResume("");

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/parse-cv", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to extract CV text.");
      }

      if (!data.text || !data.text.trim()) {
        throw new Error("No readable text was found in this CV.");
      }

      setResume(data.text);
    } catch (err: any) {
      setFileName("");
      setResume("");
      setError(err?.message || "Unable to read the CV.");
    } finally {
      setUploadingCV(false);
    }
  };

  const handleFileInput = async (
    event: ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];

    if (file) {
      await handleFile(file);
    }

    event.target.value = "";
  };

  const handleDrop = async (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();

    const file = event.dataTransfer.files?.[0];

    if (file) {
      await handleFile(file);
    }
  };

  const startHunt = async () => {
    setError("");

    if (!resume.trim()) {
      setError("Please upload your CV or paste your CV text first.");
      return;
    }

    if (!keyword.trim()) {
      setError("Please enter a target role.");
      return;
    }

    setLoading(true);
    setJobsList([]);
    setSelectedJob(null);

    let stageInterval: ReturnType<typeof setInterval> | undefined;

    try {
      setLoadingStep(0);

      stageInterval = setInterval(() => {
        setLoadingStep((step) =>
          step < loadingStages.length - 1 ? step + 1 : step
        );
      }, 2500);

      const response = await fetch("/api/hunt", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          resumeText: resume,
          fileName,
          roleKeyword: keyword,
          location,
          workTypes,
          experience,
          companyType,
          keywords,
          maxResults,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Job hunting failed.");
      }

      if (data.jobs) {
        setJobsList(data.jobs);
      } else {
        setJobsList([]);
      }

      if (data.message) {
        setError(data.message);
      }
    } catch (err: any) {
      setError(err?.message || "Something went wrong while hunting jobs.");
    } finally {
      clearInterval(stageInterval);
      setLoading(false);
      setLoadingStep(0);
    }
  };

  const toggleSaved = (url: string) => {
    setSavedJobs((current) =>
      current.includes(url)
        ? current.filter((item) => item !== url)
        : [...current, url]
    );
  };

  const scoreLabel = (score: number) => {
    if (score >= 85) return "Excellent Match";
    if (score >= 70) return "Strong Match";
    if (score >= 55) return "Potential Match";
    return "Low Match";
  };

  const scoreTheme = (score: number) => {
    if (score >= 85)
      return {
        badge: "bg-emerald-500/10 text-emerald-300",
        ring: "border-emerald-500/30 text-emerald-400",
      };
    if (score >= 70)
      return {
        badge: "bg-violet-500/10 text-violet-300",
        ring: "border-violet-500/30 text-violet-400",
      };
    if (score >= 55)
      return {
        badge: "bg-amber-500/10 text-amber-300",
        ring: "border-amber-500/30 text-amber-400",
      };
    return {
      badge: "bg-zinc-500/10 text-zinc-400",
      ring: "border-zinc-500/30 text-zinc-500",
    };
  };

  useEffect(() => {
    if (!selectedJob) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedJob(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedJob]);

  useEffect(() => {
    setDeepMatch(null);
    setDeepMatchError("");
    setDeepMatchLoading(false);
  }, [selectedJob]);

  const fetchDeepMatch = async () => {
    if (!selectedJob) return;

    setDeepMatchLoading(true);
    setDeepMatchError("");

    try {
      const response = await fetch("/api/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resumeText: resume,
          jobDescription:
            selectedJob.snippet ||
            `${selectedJob.title} at ${selectedJob.company}. ${selectedJob.analysis}`,
          companyType,
          targetRole: keyword,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Deep match analysis failed.");
      }

      setDeepMatch(data);
    } catch (err: any) {
      setDeepMatchError(
        err?.message || "Unable to generate tailored application tips."
      );
    } finally {
      setDeepMatchLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#08090c] text-white">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">

        {/* Header */}
        <header className="mb-10 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-600 font-bold">
                AI
              </div>

              <div>
                <h1 className="text-xl font-bold">JobHunter AI</h1>
                <p className="text-xs text-zinc-500">
                  Autonomous job discovery
                </p>
              </div>
            </div>
          </div>

          <div className="hidden rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-xs text-zinc-400 sm:block">
            AI-powered job matching
          </div>
        </header>

        {/* Hero */}
        <section className="mb-10">
          <div className="max-w-3xl">
            <div className="mb-4 inline-flex rounded-full border border-violet-500/20 bg-violet-500/10 px-3 py-1 text-xs text-violet-300">
              Autonomous Job Search
            </div>

            <h2 className="text-4xl font-bold tracking-tight sm:text-5xl">
              Find jobs that actually
              <span className="text-violet-400"> match you.</span>
            </h2>

            <p className="mt-4 max-w-2xl text-base leading-7 text-zinc-400">
              Upload your CV, define what you want, and let AI search,
              analyze, filter and rank relevant opportunities for you.
            </p>
          </div>
        </section>

        {/* Error */}
        {error && (
          <div
            role="alert"
            className="animate-fade-in-up mb-6 flex items-start gap-3 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300"
          >
            <span className="mt-0.5 text-red-400">⚠</span>
            <span>{error}</span>
          </div>
        )}

        {/* Main Grid */}
        <div className="grid gap-6 lg:grid-cols-[1.05fr_.95fr]">

          {/* CV Section */}
          <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-6">
            <div className="mb-5">
              <p className="text-sm font-semibold text-white">
                01 — Your CV
              </p>

              <p className="mt-1 text-sm text-zinc-500">
                Upload your resume and we'll extract the content automatically.
              </p>
            </div>

            <label
              onDragOver={(event) => event.preventDefault()}
              onDrop={handleDrop}
              className="group relative flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-white/15 bg-black/20 px-6 py-12 text-center transition hover:border-violet-500/50 hover:bg-violet-500/[0.03]"
            >
              <input
                type="file"
                accept=".pdf,.docx,.html,.htm,.txt"
                className="hidden"
                onChange={handleFileInput}
              />

              {!uploadingCV && fileName && resume && (
                <button
                  type="button"
                  aria-label="Remove uploaded CV"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setFileName("");
                    setResume("");
                    setError("");
                  }}
                  className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-black/40 text-xs text-zinc-400 transition hover:border-red-500/30 hover:text-red-400"
                >
                  ✕
                </button>
              )}

              {uploadingCV ? (
                <>
                  <div className="mb-4 h-10 w-10 animate-spin rounded-full border-2 border-white/10 border-t-violet-500" />
                  <p className="font-medium">Extracting CV...</p>
                  <p className="mt-1 text-sm text-zinc-500">
                    Reading your resume content
                  </p>
                </>
              ) : fileName && resume ? (
                <>
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/10 text-xl text-emerald-400">
                    ✓
                  </div>

                  <p className="font-medium">{fileName}</p>

                  <p className="mt-1 text-sm text-emerald-400">
                    CV successfully extracted
                  </p>

                  <p className="mt-2 text-xs text-zinc-600">
                    {(resume.length / 1000).toFixed(1)}k characters extracted
                  </p>
                </>
              ) : (
                <>
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-violet-500/10 text-2xl text-violet-400">
                    ↑
                  </div>

                  <p className="font-medium">
                    Drop your CV here or click to browse
                  </p>

                  <p className="mt-2 text-sm text-zinc-500">
                    PDF, DOCX, HTML or TXT · Maximum 5MB
                  </p>
                </>
              )}
            </label>

            <div className="my-5 flex items-center gap-4">
              <div className="h-px flex-1 bg-white/10" />
              <span className="text-xs text-zinc-600">OR PASTE TEXT</span>
              <div className="h-px flex-1 bg-white/10" />
            </div>

            <textarea
              value={resume}
              onChange={(event) => {
                setResume(event.target.value);
                setFileName("");
              }}
              placeholder="Paste your CV text here..."
              className="min-h-[180px] w-full resize-none rounded-xl border border-white/10 bg-black/20 p-4 text-sm leading-6 text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-violet-500/50"
            />
          </section>

          {/* Preferences */}
          <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-6">
            <div className="mb-5">
              <p className="text-sm font-semibold text-white">
                02 — Job Preferences
              </p>

              <p className="mt-1 text-sm text-zinc-500">
                Tell the AI what kind of opportunity you're looking for.
              </p>
            </div>

            <div className="space-y-5">

              <div>
                <label className="mb-2 block text-xs font-medium text-zinc-400">
                  Target role
                </label>

                <input
                  value={keyword}
                  onChange={(event) => setKeyword(event.target.value)}
                  placeholder="e.g. Frontend Developer"
                  className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none focus:border-violet-500/50"
                />
              </div>

              <div>
                <label className="mb-2 block text-xs font-medium text-zinc-400">
                  Location
                </label>

                <input
                  value={location}
                  onChange={(event) => setLocation(event.target.value)}
                  placeholder="e.g. Lahore, Pakistan"
                  className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none focus:border-violet-500/50"
                />
              </div>

              <div>
                <label className="mb-2 block text-xs font-medium text-zinc-400">
                  Work type
                </label>

                <div className="flex flex-wrap gap-2">
                  {WORK_TYPES.map((type) => {
                    const active = workTypes.includes(type);

                    return (
                      <button
                        key={type}
                        type="button"
                        onClick={() => toggleWorkType(type)}
                        className={`rounded-lg border px-3 py-2 text-xs transition ${
                          active
                            ? "border-violet-500/40 bg-violet-500/10 text-violet-300"
                            : "border-white/10 bg-white/[0.02] text-zinc-500 hover:text-white"
                        }`}
                      >
                        {type}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-2 block text-xs font-medium text-zinc-400">
                    Experience
                  </label>

                  <select
                    value={experience}
                    onChange={(event) => setExperience(event.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-[#0b0c10] px-3 py-3 text-sm outline-none focus:border-violet-500/50"
                  >
                    <option>Any</option>
                    <option>Entry Level</option>
                    <option>Junior</option>
                    <option>Mid Level</option>
                    <option>Senior</option>
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-xs font-medium text-zinc-400">
                    Company type
                  </label>

                  <select
                    value={companyType}
                    onChange={(event) => setCompanyType(event.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-[#0b0c10] px-3 py-3 text-sm outline-none focus:border-violet-500/50"
                  >
                    <option value="any">Any</option>
                    <option value="startup">Startup</option>
                    <option value="enterprise">Enterprise</option>
                  </select>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowAdvanced((value) => !value)}
                className="text-xs font-medium text-violet-400 hover:text-violet-300"
              >
                {showAdvanced ? "− Hide advanced search" : "+ Advanced search"}
              </button>

              {showAdvanced && (
                <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                  <label className="mb-2 block text-xs font-medium text-zinc-400">
                    Required / preferred keywords
                  </label>

                  <div className="mb-3 flex flex-wrap gap-2">
                    {keywords.map((item) => (
                      <button
                        key={item}
                        type="button"
                        onClick={() => removeKeyword(item)}
                        className="rounded-md bg-violet-500/10 px-2.5 py-1.5 text-xs text-violet-300"
                      >
                        {item} ×
                      </button>
                    ))}
                  </div>

                  <div className="flex gap-2">
                    <input
                      value={keywordInput}
                      onChange={(event) =>
                        setKeywordInput(event.target.value)
                      }
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          addKeyword();
                        }
                      }}
                      placeholder="Add keyword..."
                      className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs outline-none focus:border-violet-500/50"
                    />

                    <button
                      type="button"
                      onClick={addKeyword}
                      className="rounded-lg border border-white/10 px-3 text-xs text-zinc-300 hover:bg-white/5"
                    >
                      Add
                    </button>
                  </div>

                  <div className="mt-4">
                    <label className="mb-2 block text-xs font-medium text-zinc-400">
                      Maximum results
                    </label>

                    <select
                      value={maxResults}
                      onChange={(event) =>
                        setMaxResults(Number(event.target.value))
                      }
                      className="w-full rounded-lg border border-white/10 bg-[#0b0c10] px-3 py-2 text-xs outline-none"
                    >
                      <option value={4}>4 jobs</option>
                      <option value={6}>6 jobs</option>
                      <option value={8}>8 jobs</option>
                      <option value={10}>10 jobs</option>
                    </select>
                  </div>
                </div>
              )}

              <button
                type="button"
                disabled={loading || uploadingCV}
                onClick={startHunt}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-5 py-4 text-sm font-semibold transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading && (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                )}
                {loading ? "AI is hunting..." : "Start AI Job Hunt →"}
              </button>
            </div>
          </section>
        </div>

        {/* Loading */}
        {loading && (
          <section className="mt-8 rounded-2xl border border-violet-500/20 bg-violet-500/[0.04] p-6">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="font-semibold">AI Job Hunt in progress</p>
                <p className="mt-1 text-xs text-zinc-500">
                  {loadingStages[loadingStep]}
                </p>
              </div>

              <span className="text-sm text-violet-400">
                {loadingStep + 1}/{loadingStages.length}
              </span>
            </div>

            <div className="h-2 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-violet-500 transition-all duration-500"
                style={{
                  width: `${((loadingStep + 1) / loadingStages.length) * 100}%`,
                }}
              />
            </div>

            <div className="mt-6 grid gap-4">
              {Array.from({ length: 3 }).map((_, index) => (
                <div
                  key={index}
                  className="animate-shimmer rounded-2xl border border-white/5 p-5"
                >
                  <div className="h-3 w-24 rounded bg-white/5" />
                  <div className="mt-3 h-4 w-2/3 rounded bg-white/5" />
                  <div className="mt-2 h-3 w-1/3 rounded bg-white/5" />
                  <div className="mt-4 h-3 w-full max-w-md rounded bg-white/5" />
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Results */}
        {jobsList.length > 0 && !loading && (
          <section className="mt-10">
            <div className="mb-5 flex items-end justify-between">
              <div>
                <p className="text-sm font-semibold">03 — Best Matches</p>
                <p className="mt-1 text-sm text-zinc-500">
                  {jobsList.length} opportunities ranked by AI
                </p>
              </div>

              <div className="hidden text-xs text-zinc-600 sm:block">
                Saved: {savedJobs.length}
              </div>
            </div>

            <div className="grid gap-4">
              {jobsList.map((job, index) => {
                const theme = scoreTheme(job.score);
                const saved = savedJobs.includes(job.url);

                return (
                  <article
                    key={`${job.url}-${index}`}
                    style={{ animationDelay: `${Math.min(index, 8) * 60}ms` }}
                    className="animate-fade-in-up rounded-2xl border border-white/10 bg-white/[0.025] p-5 transition hover:border-white/20 hover:bg-white/[0.035]"
                  >
                    <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
                      <div className="min-w-0">
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <span
                            className={`rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${theme.badge}`}
                          >
                            {scoreLabel(job.score)}
                          </span>

                          <span className="text-xs text-zinc-600">
                            #{index + 1}
                          </span>
                        </div>

                        <h3 className="text-lg font-semibold">{job.title}</h3>

                        <p className="mt-1 text-sm text-zinc-500">
                          {job.company}
                          {job.location ? ` · ${job.location}` : ""}
                          {job.workType ? ` · ${job.workType}` : ""}
                        </p>

                        <div className="mt-4 flex flex-wrap gap-2">
                          {job.skills?.slice(0, 6).map((skill) => (
                            <span
                              key={skill}
                              className="rounded-md border border-white/10 px-2 py-1 text-[11px] text-zinc-400"
                            >
                              {skill}
                            </span>
                          ))}
                        </div>

                        <p className="mt-4 max-w-3xl text-sm leading-6 text-zinc-400">
                          {job.analysis}
                        </p>

                        {job.missingSkills?.length > 0 && (
                          <p className="mt-3 text-xs text-amber-400/80">
                            Missing: {job.missingSkills.join(", ")}
                          </p>
                        )}
                      </div>

                      <div className="flex shrink-0 items-center gap-3">
                        <div
                          className={`flex h-16 w-16 flex-col items-center justify-center rounded-xl border bg-black/20 ${theme.ring}`}
                        >
                          <span className="text-xl font-bold text-white">
                            {job.score}
                          </span>
                          <span className="text-[9px] uppercase text-zinc-600">
                            match
                          </span>
                        </div>

                        <button
                          type="button"
                          aria-label={saved ? "Remove from saved jobs" : "Save job"}
                          aria-pressed={saved}
                          onClick={() => toggleSaved(job.url)}
                          className={`flex h-11 w-11 items-center justify-center rounded-xl border text-base transition ${
                            saved
                              ? "border-violet-500/30 bg-violet-500/10 text-violet-300"
                              : "border-white/10 text-zinc-400 hover:border-white/20 hover:text-white"
                          }`}
                        >
                          {saved ? "★" : "☆"}
                        </button>

                        <button
                          type="button"
                          onClick={() => setSelectedJob(job)}
                          className="rounded-xl bg-white px-4 py-3 text-xs font-semibold text-black transition hover:bg-zinc-200"
                        >
                          View Job
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        )}

        {/* No Results */}
        {!loading && jobsList.length === 0 && (
          <div className="mt-10 rounded-2xl border border-dashed border-white/10 py-16 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-white/[0.03] text-zinc-600">
              ✦
            </div>

            <p className="font-medium text-zinc-400">
              Your matched jobs will appear here
            </p>

            <p className="mt-1 text-sm text-zinc-600">
              Upload your CV and start an AI job hunt.
            </p>
          </div>
        )}
      </div>

      {/* Job Modal */}
      {selectedJob && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={selectedJob.title}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          onClick={() => setSelectedJob(null)}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            className="animate-fade-in-up max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/10 bg-[#0d0e12] p-6"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs text-violet-400">
                  {selectedJob.score}% Match
                </p>

                <h2 className="mt-2 text-2xl font-bold">
                  {selectedJob.title}
                </h2>

                <p className="mt-1 text-sm text-zinc-500">
                  {selectedJob.company}
                  {selectedJob.location
                    ? ` · ${selectedJob.location}`
                    : ""}
                </p>
              </div>

              <button
                type="button"
                aria-label="Close"
                onClick={() => setSelectedJob(null)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 text-sm text-zinc-400 transition hover:border-white/20 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="mt-6">
              <h3 className="text-sm font-semibold">AI Analysis</h3>

              <p className="mt-2 text-sm leading-7 text-zinc-400">
                {selectedJob.analysis}
              </p>
            </div>

            {selectedJob.skills?.length > 0 && (
              <div className="mt-6">
                <h3 className="text-sm font-semibold">Relevant Skills</h3>

                <div className="mt-3 flex flex-wrap gap-2">
                  {selectedJob.skills.map((skill) => (
                    <span
                      key={skill}
                      className="rounded-md bg-violet-500/10 px-2.5 py-1.5 text-xs text-violet-300"
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {selectedJob.missingSkills?.length > 0 && (
              <div className="mt-6">
                <h3 className="text-sm font-semibold">Missing Skills</h3>

                <div className="mt-3 flex flex-wrap gap-2">
                  {selectedJob.missingSkills.map((skill) => (
                    <span
                      key={skill}
                      className="rounded-md bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-300"
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-6 rounded-xl border border-violet-500/20 bg-violet-500/[0.04] p-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-violet-300">
                  Tailored Application Tips
                </h3>

                {!deepMatch && !deepMatchLoading && (
                  <button
                    type="button"
                    onClick={fetchDeepMatch}
                    className="rounded-lg border border-violet-500/30 bg-violet-500/10 px-3 py-1.5 text-xs font-medium text-violet-300 transition hover:bg-violet-500/20"
                  >
                    Generate →
                  </button>
                )}
              </div>

              {!deepMatch && !deepMatchLoading && !deepMatchError && (
                <p className="mt-2 text-xs text-zinc-500">
                  Run a deeper AI pass to get a resume bullet tailored to this
                  specific listing, plus a clear apply/skip recommendation.
                </p>
              )}

              {deepMatchLoading && (
                <div className="mt-3 space-y-2">
                  <div className="animate-shimmer h-3 w-3/4 rounded" />
                  <div className="animate-shimmer h-3 w-1/2 rounded" />
                </div>
              )}

              {deepMatchError && (
                <p className="mt-2 text-xs text-red-300">{deepMatchError}</p>
              )}

              {deepMatch && (
                <div className="mt-3 space-y-4">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                      Recommendation
                    </p>
                    <p className="mt-1 text-sm leading-6 text-zinc-300">
                      {deepMatch.recommendation}
                    </p>
                  </div>

                  {deepMatch.tailoredBulletPoint && (
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                        Suggested resume bullet
                      </p>
                      <p className="mt-1 rounded-lg border border-white/10 bg-black/30 p-3 text-sm leading-6 text-zinc-200">
                        {deepMatch.tailoredBulletPoint}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            <a
              href={selectedJob.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-8 flex w-full items-center justify-center rounded-xl bg-violet-600 px-5 py-4 text-sm font-semibold hover:bg-violet-500"
            >
              Open Job Listing →
            </a>
          </div>
        </div>
      )}
    </main>
  );
}
// app/api/match/route.ts
import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

function cleanGeminiJson(text: string) {
  let clean = text.trim();

  if (clean.startsWith('```')) {
    clean = clean
      .replace(/^```(?:json)?/, '')
      .replace(/```$/, '')
      .trim();
  }

  return clean;
}

export async function POST(request: Request) {
  try {
    const {
      resumeText,
      jobDescription,
      companyType = 'any',
      targetRole = '',
    } = await request.json();

    if (!resumeText || !jobDescription) {
      return NextResponse.json(
        {
          error:
            'Missing required inputs: resumeText and jobDescription are mandatory.',
        },
        { status: 400 }
      );
    }

    let culturePrompt = '';

    if (companyType === 'startup') {
      culturePrompt = `
The candidate prefers startups.
Reward evidence of ownership, rapid product development, agile teams,
0-to-1 product work, autonomy, and fast-paced environments.
Reduce the score when the description strongly suggests slow bureaucracy,
legacy maintenance, or highly rigid processes.
`;
    }

    if (companyType === 'enterprise') {
      culturePrompt = `
The candidate prefers enterprise companies.
Reward established products, structured teams, mature engineering practices,
clear responsibilities, and stable organizational environments.
`;
    }

    const prompt = `
You are an expert technical recruiter.

Compare the candidate resume against the complete job description.

Target Role:
${targetRole || 'Not specified'}

Company Type Preference:
${companyType}

${culturePrompt}

Candidate Resume:
${resumeText}

Job Description:
${jobDescription}

Evaluate:
- Technical skill overlap
- Relevant professional experience
- Seniority
- Responsibilities
- Role alignment
- Company/culture alignment
- Important missing requirements

The score must be realistic from 0 to 100.

Return concise JSON only.
`;

    const response = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: {
            score: { type: 'INTEGER' },
            cultureAnalysis: { type: 'STRING' },
            missingSkills: {
              type: 'ARRAY',
              items: { type: 'STRING' },
            },
            matchedSkills: {
              type: 'ARRAY',
              items: { type: 'STRING' },
            },
            recommendation: { type: 'STRING' },
            tailoredBulletPoint: { type: 'STRING' },
          },
          required: [
            'score',
            'cultureAnalysis',
            'missingSkills',
            'matchedSkills',
            'recommendation',
            'tailoredBulletPoint',
          ],
        },
      },
    });

    const result = JSON.parse(cleanGeminiJson(response.text || '{}'));

    return NextResponse.json({
      score: Math.max(0, Math.min(100, Number(result.score) || 0)),
      cultureAnalysis: result.cultureAnalysis || '',
      missingSkills: Array.isArray(result.missingSkills)
        ? result.missingSkills
        : [],
      matchedSkills: Array.isArray(result.matchedSkills)
        ? result.matchedSkills
        : [],
      recommendation: result.recommendation || '',
      tailoredBulletPoint: result.tailoredBulletPoint || '',
    });
  } catch (error: any) {
    console.error('--- DETAILED GEMINI API ERROR ---');
    console.error(error?.message || error);
    console.error('---------------------------------');

    const isQuotaError = /RESOURCE_EXHAUSTED|429/.test(
      String(error?.message || '')
    );

    return NextResponse.json(
      {
        error: isQuotaError
          ? /PerDay/i.test(String(error?.message || ''))
            ? "Gemini's daily free-tier quota is exhausted for today. Try again after it resets, or use a paid Gemini API key."
            : 'Gemini is rate limited right now. Wait a minute and try again.'
          : error?.message ||
            'AI processing encountered an unexpected internal error.',
      },
      { status: isQuotaError ? 429 : 500 }
    );
  }
}

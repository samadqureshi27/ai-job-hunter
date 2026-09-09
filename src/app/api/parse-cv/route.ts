import { NextResponse } from "next/server";
import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";
import { checkRateLimit, getClientKey } from "@/lib/rateLimit";

export const runtime = "nodejs";

const PARSE_CV_RATE_LIMIT = 20;
const PARSE_CV_RATE_WINDOW_MS = 5 * 60 * 1000;

export async function POST(request: Request) {
  const rateLimitKey = getClientKey(request, "parse-cv");
  const rateLimit = checkRateLimit(
    rateLimitKey,
    PARSE_CV_RATE_LIMIT,
    PARSE_CV_RATE_WINDOW_MS
  );

  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error: `Too many uploads in a short time. Try again in ${Math.ceil(
          rateLimit.retryAfterMs / 1000
        )}s.`,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil(rateLimit.retryAfterMs / 1000)),
        },
      }
    );
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "No CV file was uploaded." },
        { status: 400 }
      );
    }

    if (file.size > 4 * 1024 * 1024) {
      return NextResponse.json(
        { error: "CV file must be smaller than 4MB." },
        { status: 400 }
      );
    }

    const fileName = file.name.toLowerCase();
    const buffer = Buffer.from(await file.arrayBuffer());

    let extractedText = "";

    // --------------------------------
    // TXT
    // --------------------------------
    if (fileName.endsWith(".txt")) {
      extractedText = buffer.toString("utf-8");
    }

    // --------------------------------
    // HTML
    // --------------------------------
    else if (
      fileName.endsWith(".html") ||
      fileName.endsWith(".htm")
    ) {
      const html = buffer.toString("utf-8");

      extractedText = html
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/p>/gi, "\n")
        .replace(/<\/div>/gi, "\n")
        .replace(/<\/li>/gi, "\n")
        .replace(/<[^>]+>/g, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&nbsp;/gi, " ")
        .replace(/&bull;/gi, "•")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/\r/g, "")
        .replace(/[ \t]+/g, " ")
        .replace(/\n\s+/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
    }

    // --------------------------------
    // PDF
    // --------------------------------
    else if (fileName.endsWith(".pdf")) {
      const parser = new PDFParse({
        data: buffer,
      });

      const result = await parser.getText();

      extractedText = result.text;

      await parser.destroy();
    }

    // --------------------------------
    // DOCX
    // --------------------------------
    else if (fileName.endsWith(".docx")) {
      const result = await mammoth.extractRawText({
        buffer,
      });

      extractedText = result.value;
    }

    // --------------------------------
    // Unsupported
    // --------------------------------
    else {
      return NextResponse.json(
        {
          error:
            "Unsupported file type. Please upload PDF, DOCX, HTML, or TXT.",
        },
        { status: 400 }
      );
    }

    // --------------------------------
    // Clean extracted text
    // --------------------------------
    extractedText = extractedText
      .replace(/\r/g, "")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    if (!extractedText) {
      return NextResponse.json(
        {
          error:
            "The CV was uploaded successfully, but no readable text could be extracted.",
        },
        { status: 422 }
      );
    }

    console.log(
      `CV extracted successfully: ${file.name} (${extractedText.length} characters)`
    );

    return NextResponse.json({
      success: true,
      fileName: file.name,
      text: extractedText,
      characters: extractedText.length,
    });
  } catch (error: any) {
    console.error("CV parsing failed:", error);

    return NextResponse.json(
      {
        error:
          error?.message ||
          "Unable to extract text from the uploaded CV.",
      },
      { status: 500 }
    );
  }
}
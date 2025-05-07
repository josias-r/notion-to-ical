import ical, { ICalCalendar } from "jsr:@sebbo2002/ical-generator";
import { Client } from "npm:@notionhq/client";
import {
  isFullDatabase,
  isFullPage,
  isNotionClientError,
} from "npm:@notionhq/client";
import {
  DatabaseObjectResponse,
  PageObjectResponse,
  PartialDatabaseObjectResponse,
  PartialPageObjectResponse,
} from "npm:@notionhq/client/build/src/api-endpoints";

const NOTION_TOKEN = Deno.env.get("NOTION_TOKEN") || "";
const DATE_PROPERTY = "Date";
const TITLE_PROPERTY = "Name";
const organisation = Deno.env.get("NOTION_ORGANISATION") || "";
const notion = new Client({ auth: NOTION_TOKEN });

function urlFromId(theId: string, dbId: string): string {
  // build a public Notion link
  return `https://notion.so/${organisation}/${dbId}&p=${
    theId.replace(
      /-/g,
      "",
    )
  }`;
}

function parseNotionEvent(
  nEvent:
    | PageObjectResponse
    | PartialPageObjectResponse
    | DatabaseObjectResponse
    | PartialDatabaseObjectResponse,
  calendar: ICalCalendar,
  dbId: string,
) {
  if (!isFullPage(nEvent)) {
    throw new Error("Not a full page");
  }
  const dateProp = nEvent.properties[DATE_PROPERTY];
  if (!("date" in dateProp) || !dateProp.date) {
    throw new Error("Date property is not a date");
  }
  const url = urlFromId(nEvent.id, dbId);

  const startRaw = dateProp.date.start;
  const start = new Date(startRaw);
  const endRaw = dateProp.date.end;
  const end = endRaw ? new Date(endRaw) : undefined;
  const lastEdit = nEvent.last_edited_time;

  const titleProp = nEvent.properties[TITLE_PROPERTY];
  if (!("title" in titleProp)) {
    throw new Error("Title property is not a title");
  }
  const title = titleProp?.title?.[0]?.plain_text || "Untitled";

  if (end) {
    calendar.createEvent({
      url,
      summary: title,
      start,
      end,
      description: `Last edited at: ${lastEdit}`,
    });
  } else {
    calendar.createEvent({
      url,
      summary: title,
      allDay: true,
      start,
      description: `Last edited at: ${lastEdit}`,
    });
  }
}

// inspired by https://github.com/tankengines/notion-ical
async function generateCalendar(dbId: string) {
  const db = await notion.databases.retrieve({ database_id: dbId });
  if (!isFullDatabase(db)) {
    throw new Error("Not a full database");
  }
  const dbTitle = db.title?.[0]?.plain_text || "Untitled";
  const calendar = ical({ name: dbTitle });

  const { results } = await notion.databases.query({
    database_id: dbId,
    filter: {
      property: DATE_PROPERTY,
      date: { is_not_empty: true },
    },
    sorts: [{ property: DATE_PROPERTY, direction: "descending" }],
  });

  for (const nEvent of results) {
    try {
      parseNotionEvent(nEvent, calendar, dbId);
    } catch (err) {
      console.error("Error parsing event", nEvent.id, err);
      throw err;
    }
  }
  return calendar;
}

async function handler(_req: Request) {
  if (!NOTION_TOKEN) {
    console.error("Missing NOTION_TOKEN env variable");
    return new Response("Missing NOTION_TOKEN env variable", {
      status: 500,
    });
  }
  const url = new URL(_req.url);
  const dbId = url.searchParams.get("dbId");
  if (!dbId) {
    return new Response("Missing dbId", { status: 400 });
  }

  try {
    const calendar = await generateCalendar(dbId);
    const ics = calendar.toString();
    return new Response(ics, {
      headers: {
        "Content-Type": "text/calendar",
        "Content-Disposition": `inline; filename="${
          calendar.name() || "Untitled"
        }.ics"`,
      },
    });
  } catch (err) {
    console.error(err);
    if (isNotionClientError(err)) {
      return new Response(
        `Error generating calendar: ${err.code} ${err.message}`,
        { status: 500 },
      );
    }
    return new Response("Error generating calendar", { status: 500 });
  }
}
Deno.serve(handler);

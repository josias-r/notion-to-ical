import ical from "jsr:@sebbo2002/ical-generator";
import { Client } from "npm:@notionhq/client";

const NOTION_TOKEN = Deno.env.get("NOTION_TOKEN");
if (!NOTION_TOKEN) {
  console.error("Missing NOTION_TOKEN env variable");
  Deno.exit(1);
}
const organisation = Deno.env.get("NOTION_ORGANISATION") || "";
const dateProperty = Deno.env.get("DATE_PROPERTY_NAME") || "Due";
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

// inspired by https://github.com/tankengines/notion-ical
async function generateCalendar(dbId: string) {
  const calendar = ical({ name: `Notion DB ${dbId}` });

  try {
    const { results } = await notion.databases.query({
      database_id: dbId,
      filter: {
        property: dateProperty,
        date: { is_not_empty: true },
      },
      sorts: [{ property: dateProperty, direction: "descending" }],
    });

    for (const nEvent of results) {
      const url = urlFromId(nEvent.id, dbId);
      console.log("Adding event", url);

      // const startRaw = nEvent.properties[dateProperty].date?.start!;
      // const start = new Date(startRaw);
      // const endRaw = nEvent.properties[dateProperty].date?.end;
      // const end = endRaw ? new Date(endRaw) : undefined;
      // const lastEdit = nEvent.last_edited_time;

      // // find the title property
      // const titleProp = Object.values(nEvent.properties).find(
      //   (p) => p.id === "title"
      // );
      // const title = titleProp?.title?.[0]?.plain_text || "Untitled";

      // if (end) {
      //   calendar.createEvent({
      //     url,
      //     summary: title,
      //     start,
      //     end,
      //     description: `Last edited at: ${lastEdit}`,
      //   });
      // } else {
      //   calendar.createEvent({
      //     url,
      //     summary: title,
      //     allDay: true,
      //     start,
      //     description: `Last edited at: ${lastEdit}`,
      //   });
      // }
    }
  } catch (err) {
    console.error("Error generating calendar for", dbId, err);
    throw err;
  }

  return calendar;
}

async function handler(_req: Request) {
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
        "Content-Disposition": `inline; filename="${dbId}.ics"`,
      },
    });
  } catch (err) {
    console.error(err);
    return new Response("Error generating calendar", { status: 500 });
  }
}
Deno.serve(handler);

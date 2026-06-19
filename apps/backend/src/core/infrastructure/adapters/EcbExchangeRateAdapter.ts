import type { IExchangeRatePort } from "../../domain/ports/IExchangeRatePort.js";
import { XMLParser } from "fast-xml-parser";
import { z } from "zod";

const EcbCubeSchema = z.object({
  "@_currency": z.string(),
  "@_rate": z.string(),
});

const EcbTimeCubeSchema = z.object({
  "@_time": z.string(),
  Cube: z.array(EcbCubeSchema),
});

export class EcbExchangeRateAdapter implements IExchangeRatePort {
  private readonly url =
    "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml";

  async getLatestRates(): Promise<{
    date: string;
    rates: Record<string, string>;
  }> {
    const response = await fetch(this.url);
    if (!response.ok) {
      throw new Error(`Failed to fetch ECB rates: ${response.statusText}`);
    }

    const xml = await response.text();

    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
      isArray: (name) => {
        if (name === "Cube" || name === "Cube[]") return true;
        return false;
      },
    });

    const parsed = parser.parse(xml);

    try {
      const rootCube = parsed["gesmes:Envelope"]["Cube"];
      const timeCube =
        rootCube[0]?.Cube?.[0] ||
        rootCube[0]?.Cube ||
        rootCube?.Cube?.[0] ||
        rootCube?.Cube;

      const validated = EcbTimeCubeSchema.parse(timeCube);

      const date = validated["@_time"];
      const rates: Record<string, string> = {};

      for (const cube of validated.Cube) {
        rates[cube["@_currency"]] = cube["@_rate"];
      }

      if (!rates["USD"]) {
        throw new Error("USD rate not found in parsed ECB XML");
      }

      return {
        date,
        rates,
      };
    } catch (err) {
      console.error(
        "[EcbExchangeRateAdapter] Failed to parse XML structure",
        err,
      );
      throw new Error("Invalid ECB XML structure");
    }
  }
}

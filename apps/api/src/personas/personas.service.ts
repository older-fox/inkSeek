import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  createDefaultPersonaDraft,
  derivedLanguageStyle,
  experienceLabelOf,
  personaDraftSchema,
  personaProfileSchema,
  type PersonaAdvanced,
  type PersonaDraft,
  type PersonaExperienceLevel,
  type PersonaGender,
  type PersonaProfile,
  type PersonaRecord,
  type PersonaSummary,
  type PersonaVersionDetail,
  type PersonaVersionSummary,
  type SavePersonaInput,
} from '@inkseek/shared';
import { PrismaService } from '../database/prisma.service.js';
import type {
  PersonaCard,
  PersonaVersion,
  Prisma,
} from '../generated/prisma/client.js';

type PersonaWithVersions = PersonaCard & { versions: PersonaVersion[] };

const SERIAL_PATTERN = /^PSN-(\d+)$/;

@Injectable()
export class PersonasService {
  constructor(private readonly prisma: PrismaService) {}

  /** Newest edit first, so the card grid reflects recent work. */
  async list(): Promise<PersonaSummary[]> {
    const rows = await this.prisma.personaCard.findMany({
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    });

    return rows.map(toSummary);
  }

  /** Loads the card with its version index; missing ids raise 404. */
  async get(id: string): Promise<PersonaRecord> {
    const row = await this.prisma.personaCard.findUnique({
      where: { id },
      include: { versions: { orderBy: { version: 'desc' } } },
    });

    if (!row) {
      throw personaNotFound();
    }

    return toRecord(row);
  }

  /** Reads one snapshot verbatim; versions are immutable once written. */
  async getVersion(id: string, version: number): Promise<PersonaVersionDetail> {
    const row = await this.prisma.personaVersion.findUnique({
      where: { personaId_version: { personaId: id, version } },
    });

    if (!row) {
      throw new NotFoundException({
        code: 'PERSONA_VERSION_NOT_FOUND',
        message: '该版本不存在或已被移除',
      });
    }

    return {
      version: row.version,
      createdAt: row.createdAt.toISOString(),
      changedFields: readStringArray(row.changedFields),
      changedCount: row.changedCount,
      data: readDraft(row.data),
    };
  }

  /**
   * Reads the current term for a channel snapshot. Called at connect time so the
   * copy always reflects the latest saved version of the card.
   */
  async latestForSnapshot(id: string): Promise<PersonaSummary> {
    const row = await this.prisma.personaCard.findUnique({ where: { id } });

    if (!row) {
      throw personaNotFound();
    }

    return toSummary(row);
  }

  /**
   * Creates the card and its first version in one transaction, allocating the
   * next PSN serial inside the same transaction so numbers stay gap-free.
   */
  async create(input: SavePersonaInput): Promise<PersonaRecord> {
    const data = input.data;
    const name = data.name.trim();

    if (!name) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: '请填写姓名',
        fieldErrors: { 'data.name': ['请填写姓名'] },
      });
    }

    const profile = createProfile(
      data,
      input.profile?.experienceLevel,
      input.profile?.gender,
      input.profile?.quote,
    );
    const changedFields = [
      ...draftFieldKeys(data),
      ...(input.profile ? ['profile.experienceLevel'] : []),
      ...(input.profile?.gender ? ['profile.gender'] : []),
      ...(input.profile?.quote ? ['profile.quote'] : []),
    ];

    const row = await this.prisma.$transaction(async (tx) => {
      const serial = await nextSerial(tx);

      return tx.personaCard.create({
        data: {
          serial,
          name,
          occupation: data.occupation.trim(),
          age: parseAge(data.age) ?? 0,
          profile: profile as unknown as Prisma.InputJsonValue,
          data: data as unknown as Prisma.InputJsonValue,
          currentVersion: 1,
          versions: {
            create: {
              version: 1,
              data: data as unknown as Prisma.InputJsonValue,
              changedFields: changedFields as unknown as Prisma.InputJsonValue,
              changedCount: changedFields.length,
            },
          },
        },
        include: { versions: { orderBy: { version: 'desc' } } },
      });
    });

    return toRecord(row);
  }

  /**
   * Appends a version with the diff against the previous draft; profile fields
   * are only touched when they actually changed, so the log stays meaningful.
   */
  async update(id: string, input: SavePersonaInput): Promise<PersonaRecord> {
    const existing = await this.prisma.personaCard.findUnique({ where: { id } });

    if (!existing) {
      throw personaNotFound();
    }

    const previous = readDraft(existing.data);
    const data = input.data;
    const changedFields = diffFields(previous, data);
    const experienceLevel = input.profile?.experienceLevel;
    const gender = input.profile?.gender;
    const quote = input.profile?.quote?.trim();
    const currentProfile = readProfile(existing.profile);
    const profileChanges: Partial<PersonaProfile> = {};

    if (experienceLevel && experienceLevel !== currentProfile.experienceLevel) {
      profileChanges.experienceLevel = experienceLevel;
      profileChanges.experienceLabel = experienceLabelOf(experienceLevel);
      changedFields.push('profile.experienceLevel');
    }

    if (gender && gender !== currentProfile.gender) {
      profileChanges.gender = gender;
      changedFields.push('profile.gender');
    }

    if (quote !== undefined && quote !== currentProfile.quote) {
      profileChanges.quote = quote;
      changedFields.push('profile.quote');
    }

    const languageStyle = derivedLanguageStyle(data);

    if (languageStyle !== currentProfile.languageStyle) {
      profileChanges.languageStyle = languageStyle;
      changedFields.push('profile.languageStyle');
    }

    const nextProfile =
      Object.keys(profileChanges).length > 0
        ? { ...currentProfile, ...profileChanges }
        : null;

    const version = existing.currentVersion + 1;

    const row = await this.prisma.$transaction(async (tx) => {
      return tx.personaCard.update({
        where: { id },
        data: {
          name: data.name.trim() || existing.name,
          occupation: data.occupation.trim(),
          age: parseAge(data.age) ?? existing.age,
          ...(nextProfile
            ? { profile: nextProfile as unknown as Prisma.InputJsonValue }
            : {}),
          data: data as unknown as Prisma.InputJsonValue,
          currentVersion: version,
          versions: {
            create: {
              version,
              data: data as unknown as Prisma.InputJsonValue,
              changedFields: changedFields as unknown as Prisma.InputJsonValue,
              changedCount: changedFields.length,
            },
          },
        },
        include: { versions: { orderBy: { version: 'desc' } } },
      });
    });

    return toRecord(row);
  }

  /** Removes the card and its version history; channel snapshots stay frozen. */
  async remove(id: string): Promise<void> {
    const existing = await this.prisma.personaCard.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!existing) {
      throw personaNotFound();
    }

    await this.prisma.personaCard.delete({ where: { id } });
  }
}

/** Builds the display profile for a new card; derived fields are computed, not asked for. */
function createProfile(
  data: PersonaDraft,
  experienceLevel: PersonaExperienceLevel = 'Ⅰ',
  gender: PersonaGender = '未设定',
  quote = '',
): PersonaProfile {
  return {
    gender,
    quote: quote.trim(),
    keywords: [],
    accent: 'brass',
    experienceLevel,
    experienceLabel: experienceLabelOf(experienceLevel),
    languageStyle: derivedLanguageStyle(data),
    addressStyle: '',
  };
}

/** Flattens a row into the list payload, including the current draft for previews. */
function toSummary(row: PersonaCard): PersonaSummary {
  return {
    id: row.id,
    serial: row.serial,
    name: row.name,
    occupation: row.occupation,
    age: row.age,
    profile: readProfile(row.profile),
    data: readDraft(row.data),
    currentVersion: row.currentVersion,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Summary plus the version index, newest first. */
function toRecord(row: PersonaWithVersions): PersonaRecord {
  return {
    ...toSummary(row),
    versions: row.versions.map(toVersionSummary),
  };
}

/** Version entries intentionally omit the full draft to keep the index small. */
function toVersionSummary(row: PersonaVersion): PersonaVersionSummary {
  return {
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    changedFields: readStringArray(row.changedFields),
    changedCount: row.changedCount,
  };
}

/** Broken profile JSON falls back to schema defaults instead of failing the read. */
function readProfile(value: Prisma.JsonValue): PersonaProfile {
  const parsed = personaProfileSchema.safeParse(value);
  return parsed.success ? parsed.data : personaProfileSchema.parse({});
}

/**
 * Tolerates older or partial card data: unknown keys are merged over the defaults
 * and any remaining validation gap yields a complete default draft.
 */
function readDraft(value: Prisma.JsonValue): PersonaDraft {
  const parsed = personaDraftSchema.safeParse(value);

  if (parsed.success) {
    return parsed.data;
  }

  const defaults = createDefaultPersonaDraft();
  const source =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const advanced =
    source.advanced && typeof source.advanced === 'object' && !Array.isArray(source.advanced)
      ? (source.advanced as Record<string, unknown>)
      : {};
  const fallback = {
    ...defaults,
    ...source,
    advanced: { ...defaults.advanced, ...advanced },
  };
  const merged = personaDraftSchema.safeParse(fallback);

  return merged.success ? merged.data : createDefaultPersonaDraft();
}

/** Keeps only string entries from a stored JSON array. */
function readStringArray(value: Prisma.JsonValue): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

/** Flattens the draft into `advanced.*` keys so diffs address leaf fields. */
function draftFieldKeys(data: PersonaDraft): string[] {
  return (Object.keys(data) as (keyof PersonaDraft)[]).flatMap((key) =>
    key === 'advanced'
      ? (Object.keys(data.advanced) as (keyof PersonaAdvanced)[]).map(
          (field) => `advanced.${field}`,
        )
      : [key],
  );
}

/** JSON comparison per field, expanding `advanced` so the changelog names the leaf. */
function diffFields(previous: PersonaDraft, next: PersonaDraft): string[] {
  return (Object.keys(next) as (keyof PersonaDraft)[]).flatMap((key) => {
    if (key === 'advanced') {
      return (Object.keys(next.advanced) as (keyof PersonaAdvanced)[])
        .filter(
          (field) =>
            JSON.stringify(previous.advanced[field]) !== JSON.stringify(next.advanced[field]),
        )
        .map((field) => `advanced.${field}`);
    }

    return JSON.stringify(previous[key]) === JSON.stringify(next[key]) ? [] : [key];
  });
}

/** Derives the numeric age from free text, returning null when it is not a usable number. */
function parseAge(value: string): number | null {
  const parsed = Number.parseInt(value.trim(), 10);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 999 ? parsed : null;
}

/** Continues the PSN-0001 series from the highest existing serial. */
async function nextSerial(tx: Prisma.TransactionClient): Promise<string> {
  const latest = await tx.personaCard.findFirst({
    orderBy: { serial: 'desc' },
    select: { serial: true },
  });
  const match = latest?.serial.match(SERIAL_PATTERN);
  const next = (match?.[1] ? Number.parseInt(match[1], 10) : 0) + 1;

  return `PSN-${String(next).padStart(4, '0')}`;
}

/** Shared 404 for every card lookup. */
function personaNotFound(): NotFoundException {
  return new NotFoundException({
    code: 'PERSONA_NOT_FOUND',
    message: '人格卡不存在或已被删除',
  });
}

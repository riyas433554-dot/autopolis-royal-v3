export const ECC_DEFINITION_COUNT = 72;
export const ECC_ACADEMY_COUNT = 35;
export const ECC_CITY_STAFF_COUNT = 37;

/**
 * Build the immutable first-import split:
 * 35 Academy trainees + 37 ECC city staff, one staff member per seeded building.
 * The Academy is itself one of the 37 buildings and receives one city staff member.
 */
export function buildInitialEccRoster(entries, buildingRows) {
  if (!Array.isArray(entries) || entries.length !== ECC_DEFINITION_COUNT) {
    throw new Error(`Expected ${ECC_DEFINITION_COUNT} ECC definitions; found ${entries?.length ?? 0}`);
  }
  if (!Array.isArray(buildingRows) || buildingRows.length !== ECC_CITY_STAFF_COUNT) {
    throw new Error(`Expected exactly ${ECC_CITY_STAFF_COUNT} city buildings; found ${buildingRows?.length ?? 0}`);
  }

  const slugs = buildingRows.map(row => row?.slug).filter(Boolean).sort();
  if (slugs.length !== ECC_CITY_STAFF_COUNT || new Set(slugs).size !== ECC_CITY_STAFF_COUNT) {
    throw new Error('City building slugs must be 37 non-empty unique values');
  }
  if (!slugs.includes('agent-academy')) {
    throw new Error('The 37-building city roster must include agent-academy');
  }

  return entries.map((entry, index) => {
    const isAcademy = index < ECC_ACADEMY_COUNT;
    return {
      ...entry,
      lifecycle_status: isAcademy ? 'academy' : 'city_staff',
      assigned_building_slug: isAcademy ? 'agent-academy' : slugs[index - ECC_ACADEMY_COUNT],
      assignment_duty: isAcademy ? 'academy_training' : 'ecc_city_interview_hiring_and_building_support',
    };
  });
}

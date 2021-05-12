// [ADDING EXTERNAL SERVICE] To add entities from external services:
// [ADDING EXTERNAL SERVICE] - STEP 1 - Add a data model from an external service to the project (by selecting the relevant menu option in SAP Web IDE).
// [ADDING EXTERNAL SERVICE] - STEP 2 - Add a reference to the external service model file:
// using <external_service_name> as <alias_name> from '../srv/external/csn/<external_service_name>';

using { Country, Currency, Language, managed } from '@sap/cds/common';

using my.site.cockpit as sc from '../db/data-model';

service scService {
  entity Logins as projection on sc.Logins;
  entity Addresses as projection on sc.Addresses;
  entity Experiences as projection on sc.Experiences;
  entity UoMs as projection on sc.UoMs;
  entity Disciplines as projection on sc.Disciplines;
  entity Professions as projection on sc.Professions;
  entity WageClasses as projection on sc.WageClasses;
  entity Skills as projection on sc.Skills;
  entity SkillsForRecipe as projection on sc.SkillsForRecipe;
  entity Recipes as projection on sc.Recipes;
  entity RecipeResults as projection on sc.RecipeResults;
  entity PulseSteps as projection on sc.PulseSteps;
  entity Pulses as projection on sc.Pulses;
  entity Projects as projection on sc.Projects;
  entity Companies as projection on sc.Companies;
  entity CompaniesForProjects as projection on sc.CompaniesForProjects;
  entity DisciplinesOfCompanies as projection on sc.DisciplinesOfCompanies;
  entity OrganisationLevels as projection on sc.OrganisationLevels;
  entity Persons as projection on sc.Persons;
  entity UsersOfProject as projection on sc.UsersOfProject;
  entity WorkerDeployments as projection on sc.WorkerDeployments;
  entity QualityTypes as projection on sc.QualityTypes;
  entity HealthAndSafetyTypes as projection on sc.HealthAndSafetyTypes;
  entity ProblemTypes as projection on sc.ProblemTypes;
  entity SeverityTypes as projection on sc.SeverityTypes;
  entity Crews as projection on sc.Crews;
  entity Locations as projection on sc.Locations;
  entity SpecialDates as projection on sc.SpecialDates;
  entity TimeTypes as projection on sc.TimeTypes;
  entity ShiftParts as projection on sc.ShiftParts;
  entity Shifts as projection on sc.Shifts;
  entity BIMLocations as projection on sc.BIMLocations;
  entity Pics as projection on sc.Pics;
  entity WorkersForTask as projection on sc.WorkersForTask;
  entity CrewsForTask as projection on sc.CrewsForTask;
  entity Tasks as projection on sc.Tasks;
  entity Measurements as projection on sc.Measurements;
  entity ProblemCards as projection on sc.ProblemCards;
  entity Timesheets as projection on sc.Timesheets;
  entity TimeSheetEntries as projection on sc.TimeSheetEntries;
  annotate scService.Countries with @cds.persistence.skip :false;
  annotate scService.Currencies with @cds.persistence.skip :false;
  annotate scService.Countries with @cds.persistence.exists :true;
  annotate scService.Currencies with @cds.persistence.exists :true;
}

namespace my.site.cockpit;

using { Country, Currency, Language, managed, sap.common.CodeList } from '@sap/cds/common';

/////////////// Access and Login management //////////////////

entity Logins : managed {
	key ID			: UUID; // user email and date are inserted
		role		: String(50);
		projectCode : String(50);
		app			: String(30);
}

////// base data ////////

entity Addresses : managed {
	key ID				: UUID;
		kind			: String(255); // HO, subsidiary, storage, etc.
		street			: String(255);
		houseNumber		: String(20);
		addition		: String(255);
		zip				: String(10);
		poBox			: String(30);
		zipPoBox		: String(10);
		town			: String(255);
		state			: String(100);
		county			: String(100);
		country			: Country;
		longitude       : Decimal(15, 12);
        latitude        : Decimal(15, 12);
}

entity Experiences : managed {
    key ID           : UUID;
    	code         : localized String(2)  not null;
        description  : localized String(50) not null;
}

entity UoMs : managed {
    key ID      		: UUID;
    	code    		: localized String(8);
        description 	: localized String(20);
        dimension		: Integer not null default 0; //0=count, 1=length, 2=area, 3=volume
        imperial		: Boolean;
        baseUnit		: association to UoMs;
        conversionFactor: Decimal(20, 5);
}

entity Disciplines : managed {
    key ID           : UUID;
    	code         : localized String(10) not null;
        description  : localized String(50);
        colour		 : String(7);
}

entity Professions : managed {
    key ID           : UUID;
    	code         : localized String(10) not null;
        description  : localized String(50);
        discipline   : association to Disciplines;
}

entity WageClasses : managed {
    key ID          : UUID;
    	wageClass   : localized String(50) not null;
        rate		: Decimal(10, 3); //rate per hour
        currency	: Currency;
}

entity Skills : managed {
    key ID         : UUID;
        profession : association[1] to Professions;
        experience : association[1] to Experiences;
}

entity SkillsForRecipe : managed {
	key ID			: UUID;
		skill		: association[1] to Skills;
		recipe		: association[1] to Recipes;
		rank		: Integer;
}

entity Recipes : managed {
    key ID              : UUID;
    	code            : localized String(50);
        shortText       : localized String(50);
        description     : localized String;
        UoM             : association[1]    to UoMs;
        productivity    : Decimal(10, 3); // quantity of UoMs per hour
        waitDuration	: Integer; // waiting time in ms before the next task can start
        discipline      : association       to Disciplines;
        colour          : String(7);
        requiredSkills  : composition of many SkillsForRecipe on requiredSkills.recipe=$self;
        recipeResults	: composition of many RecipeResults on recipeResults.recipe=$self;
}

entity RecipeResults : managed {
	key ID				: UUID;
		recipe			: association[1] to Recipes;
		task			: association to Tasks;
		project			: association[1] to Projects;
		company			: association to Companies;
		productivityPlan : Decimal(10, 3); // includes productivity factor
		recordingDate	: DateTime;
		quantity		: Decimal(10, 3);
		netDuration		: Decimal(10, 3);
		headCount		: Integer;
}

entity PulseSteps : managed {
    key ID           : UUID;
        step	     : Integer        not null default 1;
        recipe       : association to Recipes;
        pulse        : association[1] to Pulses;
}

entity Pulses : managed {
    key ID          : UUID;
    	code        : localized String(50);
    	shortText	: localized String(50);
        description : localized String(500);
        pulseSteps  : association[0..*] to PulseSteps on pulseSteps.pulse=$self;
}

entity Projects : managed {
    key ID                   : UUID;
        code                 : String(50) not null;
        description          : localized String(500);
        address				 : association to Addresses;
        productivityFactor   : Decimal(5, 3); // applied to all recipes
        BIMURI               : String(255);
        BIMModelID			 : String(255);
        plannedStartDate     : Date;
        plannedEndDate       : Date;
        plannedCost          : Decimal(12, 3);
        estimatedStartDate   : Date;
        estimatedEndDate     : Date;
        estimatedCost        : Decimal(12, 3);
        actualStartDate      : Date;
        actualEndDate        : Date;
        actualCost           : Decimal(12, 3);
        currency			 : Currency;
        status				 : Integer enum {
							        planned = 0; 
							        started = 1; 
							        completed = 2;
								};
        companies			 : composition of many CompaniesForProjects on companies.project=$self;
        shifts				 : composition of many Shifts on shifts.project=$self;
        timeTypes			 : composition of many TimeTypes on timeTypes.project=$self;
        specialDates		 : composition of many SpecialDates on specialDates.project=$self;
        deployedWorkers		 : composition of many WorkerDeployments on deployedWorkers.project=$self;
        crews				 : composition of many Crews on crews.project=$self;
        locations			 : composition of many Locations on locations.project=$self;
        users				 : composition of many UsersOfProject on users.project=$self;
        planVersions		 : composition of many PlanVersions on planVersions.project=$self;
}

entity Companies : managed {
    key ID           : UUID;
    	companyName  : String(200);
    	class		 : localized String(20); // customer, vendor, etc.
    	address		 : association to Addresses;
    	disciplines  : composition of many DisciplinesOfCompanies on disciplines.company=$self;
    	projects     : composition of many CompaniesForProjects on projects.company=$self;
}

entity CompaniesForProjects : managed {
	key ID				: UUID;
		project			: association[1] to Projects;
		company			: association[1] to Companies;
		discipline		: association to Disciplines; // one record per disciplin
}

entity DisciplinesOfCompanies : managed {
	key ID				: UUID;
		discipline		: association[1] to Disciplines;
		company			: association[1] to Companies;
}

entity OrganisationLevels : managed {
    key ID          : UUID;
    	orgLevel    : Integer not null;
        description : localized String(50);
}

entity Persons : managed {
    key ID                  : UUID;
        personnelID         : String(40);
        gender              : localized String(20);
        firstName           : String(50);
        middleName          : String(50);
        lastName            : String(50);
        country             : Country;
        email               : String(100);
        mobile              : String(50);
        birthday            : Date;
        orgLevel            : association       to OrganisationLevels;
        profession          : association       to Professions;
        experience          : association       to Experiences;
        wageClass           : association       to WageClasses;
        deployment			: association       to WorkerDeployments; // only one deployment at a time; additional entries in WorkerDeployments for reservation only
        company             : association       to Companies;
        memberOfCrew        : association       to Crews;
        tasks               : composition of many WorkersForTask on tasks.worker=$self; //person can be booked for multiple tasks
        timesheets			: composition of many Timesheets on timesheets.person=$self;
}

entity UsersOfProject : managed {
	key ID					: UUID;
		project				: association to Projects;
		person				: association to Persons;
}

entity WorkerDeployments : managed {
	key ID						: UUID;
		worker					: association[1] to Persons;
		project					: association[1] to Projects;
		deploymentStart			: Date;
		deploymentEnd			: Date;
}

entity QualityTypes : managed {
    key ID          	: UUID;
    	number      	: Integer not null;
        description 	: localized String(50);     // e.g. approved, not approved, rework "..."
}

entity HealthAndSafetyTypes : managed {
    key ID          : UUID;
    	number      : Integer not null;
        description : localized String(50);     // e.g. accident, safety violation, etc.
}

entity ProblemTypes : managed {
    key ID             : UUID;
    	number         : Integer not null;
        description    : localized String(50);  // e.g. material missing, waiting for completion of successor task, idea
}

entity SeverityTypes : managed {
    key ID              : UUID;
    	number          : Integer not null;
        description     : localized String(50); // e.g. critical, normal
}

//////// project dependent master data //////////////

entity Crews : managed {
    key ID                  : UUID;
        project             : association[1]    to Projects;
        crewName            : String(50) not null;
        crewNumber          : Integer not null default 1; // there are multiple crews with the same name
        crewMembers         : association[0..*] to Persons   on crewMembers.memberOfCrew=$self;
        chargeHand		    : association       to Persons;
        tasks				: composition of many CrewsForTask     on tasks.crew=$self;
}

entity Locations : managed { // can be locations or activities
    key ID          			: UUID;
    	project			        : association[1] to Projects;
    	code					: String(50);
    	description			    : String(50);
        nodeID					: Integer; // must not be a key
        parentNodeID		    : Integer;
        hierarchyLevel			: Integer;
        drillState				: String(10); // expanded or leaf - it really means "hasChildren"
        parent					: association to Locations;
        //children				: composition of many Locations on children.parent=$self; doesn't work!!! 
        // earliestStart		: Date; // constraint for sequencing
        startDate				: Date; // planned
        endDate					: Date; // planned
        estimatedEnd			: Date;
        actualStart				: Date;
        actualEnd				: Date;
        isCriticalPath			: Boolean;
        isMilestome				: Boolean;
        magnitude				: Integer;
        severityText			: String(30);
        plannedCost				: Decimal(10, 3);
        actualCost				: Decimal(10, 3);
        earnedValue				: Decimal(10, 3);
        percentageCompletion	: Decimal(10, 3);
        tasks					: composition of many Tasks on tasks.location=$self; 
}

entity SpecialDates : managed {
	key ID				: UUID;
		project 	    : association[1] to Projects;
		specialDate		: Date; // weekend: year 9999 for weekend, month for weekday
		description		: localized String(50);
}

entity TimeTypes : managed {
    key ID            : UUID;
        project       : association[1] to Projects;
    	code          : localized String(50) not null; // normal, overtime
        breakTime	  : Boolean;
        wageIncrease  : Decimal(4, 2); // % increase to basic wage rate
}

entity ShiftParts : managed {
    key ID			 : UUID;
        startTimeHrs : Integer;
        startTimeMins: Integer;
        endTimeHrs   : Integer;
        endTimeMins  : Integer;
        nextDay		 : Boolean;
        timeType     : association[1] to TimeTypes;
        shift        : association[1] to Shifts;
}

entity Shifts : managed {
    key ID          		: UUID;
        project     		: association[1]       to Projects;
    	code        		: localized String(50) not null; //e.g. day shift
    	defaultShift		: Boolean;
    	ignoreWeekends		: Boolean;
    	ignoreHolidays		: Boolean;
        shiftParts  		: composition of many ShiftParts on shiftParts.shift=$self;
}

///////// Project data //////////////////

entity BIMLocations : managed {
    key ID             : UUID;
        project        : association[1] to Projects;
        BIMObject      : String(100); // not all use UUIDs
        task           : association to Tasks;
        step		   : Integer; // for the sequence of work
}

entity Pics : managed {
	key ID			: UUID;
		project     : association[1] to Projects;
		pic			: LargeBinary @Core.MediaType : 'image/png'; //added annotation
		measurement	: association to Measurements;
		problem		: association to ProblemCards;
}

entity WorkersForTask : managed { // workers can be assigned/reserved for multiple tasks
    key ID                 : UUID;
    	project            : association[1] to Projects;
        worker             : association[1] to Persons;
        task               : association[1] to Tasks;
}

entity CrewsForTask : managed { // crews can be assigned/reserved for multiple tasks
    key ID                 : UUID;
    	project            : association[1] to Projects;
        crew               : association[1] to Crews;
        task               : association[1] to Tasks;
}

//@Capabilities.SearchRestrictions.Searchable: true
//@Search.defaultSearchElement: 'shortText'
entity Tasks : managed {
    key ID                   : UUID;
        project              : association[1]    to Projects;
        taskName             : localized String(50) not null;
        number               : Integer    not null default 1; // there are multiple tasks with the same code
        shortText            : localized String(50) not null;
        description          : localized String;
        recipe               : association       to Recipes;         // the recipe the task is based on
        pulseStep			 : association		 to PulseSteps;
        UoM                  : association[1]    to UoMs;
        shift				 : association to Shifts;
        quantity             : Decimal(10, 3);
        actualQuantity		 : Decimal(10, 3); // = cumulative measurement
        price				 : Decimal(10, 3); // in case of subcontracted
        plannedTotalPrice	 : Decimal(10, 3); // sub contract only
        actualTotalPrice	 : Decimal(10, 3); // if not lump sum it can differ from plannedTotalPrice
        lumpSum				 : Boolean; // if true the total doesn't increase even if cumulative quants are higher
        plannedProductivity  : Decimal(10, 3);
        productivityFactor   : Decimal(5, 3); // a task specific factor
        currentProductivity  : Decimal(10, 3);
        KPI					 : Decimal(5, 3); // (current / planned * factor); for filter
        discipline           : association[1]    to Disciplines;
        colour               : String(7);
        location             : association[1]    to Locations;
        BIMLocation          : composition of many BIMLocations    on BIMLocation.task=$self;
        supervisor			 : association[0..1] to Persons;
        crews                : composition of many CrewsForTask on crews.task=$self;
        workers              : composition of many WorkersForTask on workers.task=$self;
        plannedStart         : DateTime;
        plannedEnd           : DateTime;
        estimatedEnd         : DateTime; // updated after new measurement and at completion
        actualStart          : DateTime; // set when task is started
        actualEnd            : DateTime; // set at time of approval
        stoppedAt			 : DateTime;
        stopDuration		 : Integer; // in ms
        waitDuration		 : Integer; // in ms
        status				 : Integer enum {
							        planned = 0; 
							        committed = 1; 
							        started = 2; 
							        stopped = 3; 
							        completed = 4; 
							        approved = 5;
								};
        buffer				 : Boolean; // e.g. drying time
        pinned				 : Boolean; // must not be moved
		company				 : association to CompaniesForProjects;
        measurements         : composition of many Measurements     on measurements.task=$self;
        problems             : composition of many ProblemCards    on problems.task=$self;
        timeSheetEntries	 : composition of many TimeSheetEntries on timeSheetEntries.task=$self;
        costPlanned			 : Decimal(10, 3); // subcontract see above (price)
        costActual			 : Decimal(10, 3);
        costLaborPlanned	 : Decimal(10, 3);
        costLaborActual		 : Decimal(10, 3);
        hoursLaborPlanned	 : Decimal(10, 3);
        hoursLaborActual	 : Decimal(10, 3);
        costMaterialPlanned	 : Decimal(10, 3);
        costMaterialActual	 : Decimal(10, 3);
        costEquipmentPlanned : Decimal(10, 3);
        costEquipmentActual  : Decimal(10, 3);
        hoursEquipmentPlanned: Decimal(10, 3);
        hoursEquipmentActual : Decimal(10, 3);
}

entity Measurements : managed {
    key ID                   : UUID;
        project              : association[1] to Projects;
        task                 : association[1] to Tasks;
        measurementDateTime  : DateTime;
        measurementQuantity  : Decimal(10, 3); //cumulative
        netDuration			 : Decimal(10, 3); //net duration in hours since actual task start
        measurementPics      : composition of many Pics on measurementPics.measurement=$self;
}

entity ProblemCards : managed {
    key ID                : UUID;
        project           : association[1] to Projects;
        task              : association[1] to Tasks;
        shortText		  : localized String(100);
        problemDateTime   : DateTime;
        isQuality		  : Boolean;
        isProblem		  : Boolean;
        isHnS			  : Boolean;
        quality           : association to QualityTypes;
        problem           : association to ProblemTypes;
        HealthandSafety	  : association to HealthAndSafetyTypes;
        severity          : association to SeverityTypes;
        description       : localized String(500);
        problemPics		  : composition of many Pics on problemPics.problem=$self;
}

entity Timesheets		: managed {
	key ID				: UUID;
		project			: association to Projects;
		person			: association to Persons;
		workingDate		: DateTime;
		hoursWorked		: Decimal(10, 3);
		hoursShift		: Decimal(10, 3);
		costWorking		: Decimal(10, 3); // redundant on purpose because wages change over time
		costShift		: Decimal(10, 3);
        approved		: Boolean;
        transferred		: Boolean;
        timeSheetEntries: composition of many TimeSheetEntries on timeSheetEntries.timesheet=$self;
}

entity TimeSheetEntries : managed { // no currency; all currencies are converted into project currency
	key ID				: UUID;
		project			: association to Projects;
		person			: association to Persons;
		task			: association to Tasks;
		timesheet		: association to Timesheets;
		workingDate		: DateTime;
		shiftPart		: association to ShiftParts; // has links to shift, timeType
		startTimeHrs	: Integer;
        startTimeMins	: Integer;
        endTimeHrs  	: Integer;
        endTimeMins 	: Integer;
        stopTime		: Boolean;
        hoursWorked		: Decimal(10, 3);
        rate			: Decimal(10, 3); // redundant; is wage rate times wage increase of time type
        calculatedCost	: Decimal(10, 3); // redundant on purpose because wages change over time
}

entity PlanVersions		: managed {
	key ID				: UUID;
		project			: association to Projects;
		snapshotDate	: DateTime;
		versionNumber	: String(50);
		description		: localized String(500);
		useCase			: Integer enum {
							daily = 0;
							weekly = 1;
							monthly = 2;
							longterm = 3;
						};
		snapshotTasks	: composition of many SnapshotTasks on snapshotTasks.planVersion=$self;
		snapshotsComplete : Boolean; // only display for selection once all snapshots were taken
}

entity SnapshotTasks		 : managed { // a copy of the main values of a task
	key ID					 : UUID;
		planVersion			 : association to PlanVersions;
		location			 : association to Locations; // to avoid an expand to tasks
		task				 : association to Tasks; // to retrieve additional data like location, recipe, etc.
		shift				 : association to Shifts; // to avoid an expand to tasks
		plannedStart         : DateTime;
        plannedEnd           : DateTime;
        estimatedEnd         : DateTime; // updated after new measurement and at completion
        actualStart          : DateTime; // set when task is started
        actualEnd            : DateTime; // set at time of approval
        stoppedAt			 : DateTime;
        stopDuration		 : Integer; // in ms
        waitDuration		 : Integer; // in ms
        status				 : Integer enum {
							        planned = 0; 
							        committed = 1; 
							        started = 2; 
							        stopped = 3; 
							        completed = 4; 
							        approved = 5;
								};
		plannedQuantity      : Decimal(10, 3);
        actualQuantity		 : Decimal(10, 3);
        plannedProductivity  : Decimal(10, 3);
        productivityFactor   : Decimal(5, 3);
        currentProductivity  : Decimal(10, 3);
        costPlanned			 : Decimal(10, 3);
        costActual			 : Decimal(10, 3);
        costLaborPlanned	 : Decimal(10, 3);
        costLaborActual		 : Decimal(10, 3);
        hoursLaborPlanned	 : Decimal(10, 3);
        hoursLaborActual	 : Decimal(10, 3);
        costMaterialPlanned	 : Decimal(10, 3);
        costMaterialActual	 : Decimal(10, 3);
        costEquipmentPlanned : Decimal(10, 3);
        costEquipmentActual  : Decimal(10, 3);
        hoursEquipmentPlanned: Decimal(10, 3);
        hoursEquipmentActual : Decimal(10, 3);
        costSubcontractorPlanned : Decimal(10, 3);
        costSubcontractorActual  : Decimal(10, 3);
}
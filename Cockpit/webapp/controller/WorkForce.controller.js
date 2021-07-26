sap.ui.define([
	"sap/ui/core/routing/History",
	"sap/ui/model/json/JSONModel",
	"cockpit/Cockpit/controller/BaseController",
	"sap/base/Log",
	"sap/m/Dialog",
	"sap/m/Button",
	"sap/ui/model/type/DateTime",
	"sap/ui/model/SimpleType",
	"sap/m/MessageToast",
	"sap/m/MessageBox",
	"sap/ui/model/Filter",
	"sap/m/GroupHeaderListItem",
	"cockpit/Cockpit/model/formatter"
], function (History, JSONModel, BaseController, Log, Dialog, Button, DateTime, SimpleType, MessageToast, MessageBox, Filter,
	GroupHeaderListItem, formatter) {
	"use strict";

	return BaseController.extend("cockpit.Cockpit.controller.WorkForce", {

		// this view is bound to one task; all selected tasks have the same recipe

		formatter: formatter,

		onInit: function () {
			var iOriginalBusyDelay,
				oViewModel = new JSONModel({
					busy: false,
					delay: 0,
					crewSelected: false,
					workerSelected: false,
					skillsForCrewListTitle: "",
					addCrewListTitle: "",
					addWorkerListTitle: "",
					busyCrewFilters: undefined,
					requiredSkillsCount: 0,
					crewCount: 0,
					workerCount: 0,
					workerTabSelected: false,
					skillSelected: false,
					skillFilters: undefined,
					busyWorkerFilters: undefined
				});
			this.setModel(oViewModel, "workForceView");

			this.getRouter().getRoute("WorkForce").attachPatternMatched(this._onObjectMatched, this);

			// Store original busy indicator delay, so it can be restored later on
			iOriginalBusyDelay = this.getView().getBusyIndicatorDelay();
			this.getOwnerComponent().getModel().metadataLoaded().then(function () {
				// Restore original busy indicator delay for the object view
				oViewModel.setProperty("/delay", iOriginalBusyDelay);
			});

			this.getOwnerComponent().getModel().metadataLoaded().then(this._onMetadataLoaded.bind(this));
		},

		_onObjectMatched: function (oEvent) {
			var sObjectId = oEvent.getParameter("arguments").ID,
				sObjectPath;
			this.getModel().metadataLoaded().then(function () {
				sObjectPath = this.getModel().createKey("Tasks", {
					ID: sObjectId
				});
				sObjectPath = "/" + sObjectPath;
				this._bindView(sObjectPath);
			}.bind(this));
		},

		_bindView: function (sObjectPath) {
			var oViewModel = this.getModel("workForceView"),
				that = this;

			this.getView().bindElement({
				path: sObjectPath,
				events: {
					change: function () {
						oViewModel.setProperty("/busy", false);
						that._refreshCrewList();
						oViewModel.setProperty("/crewSelected", false);
						that._refreshWorkerList();
						oViewModel.setProperty("/workerSelected", false);
					},
					dataRequested: function () {
						oViewModel.setProperty("/busy", true);
					},
					dataReceived: function () {
						oViewModel.setProperty("/busy", false);
					}
				}
			});
		},

		_onMetadataLoaded: function () {
			// Store original busy indicator delay for the detail view
			var oViewModel = this.getModel("workForceView"),
				oAddCrewsTable = this.byId("addCrewsList"),
				oAddWorkersList = this.byId("addWorkersList"),
				iOriginalLineItemTableBusyDelay = oAddCrewsTable.getBusyIndicatorDelay(),
				that = this;

			// Make sure busy indicator is displayed immediately when
			// detail view is displayed for the first time
			oViewModel.setProperty("/delay", 0);

			// filter for crews of the project
			oAddCrewsTable.attachEventOnce("updateFinished", function () {
				// Restore original busy indicator delay for line item table
				oViewModel.setProperty("/delay", iOriginalLineItemTableBusyDelay);
				that._refreshCrewList();
			});
			// filter for workers of the project
			oAddWorkersList.attachEventOnce("updateFinished", function () {
				// Restore original busy indicator delay for line item table
				oViewModel.setProperty("/delay", iOriginalLineItemTableBusyDelay);
				that._refreshWorkerList();
			}); // exclude crews/workers that are already assigned to the task(s)

			// Binding the view will set it to not busy - so the view is always busy if it is not bound
			oViewModel.setProperty("/busy", true);
		},

		//////////////////////////////////////// CREWS TAB //////////////////////////////////////////

		_getInitialExistingCrewFilters: function (sObjectPath) {
			var aExistingCrews = this.getModel().createBindingContext(sObjectPath).getProperty("crews"),
				sProjectID = this.getModel("appView").getProperty("/selectedProjectID"),
				oModel = this.getModel(),
				sCrewID,
				aFilters = [];

			if (this.getModel("appView").getProperty("/selectedTaskIDs").length > 0) {
				return []; // if multiple tasks are selected don't exclude existing crews
			}
			// exclude existing crew assignments from crew selection list
			for (var i = 0; i < aExistingCrews.length; i++) {
				//sCrewID = aExistingCrews[i].getBindingContext().getPropwerty("crew_ID");
				sCrewID = oModel.createBindingContext("/" + aExistingCrews[i]).getProperty("crew_ID");
				aFilters.push(new Filter("ID", sap.ui.model.FilterOperator.NE, sCrewID));
			}
			return aFilters;
		},

		onSwitchAvailableCrews: function (oEvent) {
			var bSwitchOn = oEvent.getParameter("state"),
				oStartDatePicker = this.byId("startDatePickerForCrew"),
				oEndDatePicker = this.byId("endDatePickerForCrew"),
				oInfoToolbar = this.byId("infoToolbarForCrew"),
				oTask = this.getView().getBindingContext().getObject(),
				oModel = this.getModel(),
				aSelectedTaskIDs = this.getModel("appView").getProperty("/selectedTaskIDs"),
				sTaskPath,
				oMinDate = (oTask.status > 1) ? oTask.actualStart : oTask.plannedStart,
				oMaxDate = oTask.estimatedEnd;

			if (oStartDatePicker.getValueState() === "Error") {
				return;
			}
			if (aSelectedTaskIDs.length === 1) {
				if (oTask.status > 1) {
					oStartDatePicker.setDateValue(oTask.actualStart);
				} else {
					oStartDatePicker.setDateValue(oTask.plannedStart);
				} // oEndDatePicker is bound to est8imatedEnd in XML view
			} else {
				for (var i = 0; i < aSelectedTaskIDs.length; i++) {
					sTaskPath = "/" + oModel.createKey("Tasks", {
						ID: aSelectedTaskIDs[i]
					});
					oTask = oModel.getObject(sTaskPath);
					if (oTask.status > 1) {
						oMinDate = (oMinDate > oTask.actualStart) ? oTask.actualStart : oMinDate;
					} else {
						oMinDate = (oMinDate > oTask.plannedStart) ? oTask.plannedStart : oMinDate;
					}
					oMaxDate = (oMaxDate < oTask.estimatedEnd) ? oTask.estimatedEnd : oMaxDate;
				}
				oStartDatePicker.setDateValue(oMinDate);
				oEndDatePicker.setDateValue(oMaxDate);
			}
			oInfoToolbar.setVisible(bSwitchOn);
			if (!bSwitchOn) {
				this.getModel("workForceView").setProperty("/busyCrewFilters", undefined);
				this._refreshCrewList();
			} else {
				this.onCrewSearchDateChanged(); // includes build (initial) busyWorkerFilters and refresh
			}
		},

		onCrewSearchDateChanged: function () {
			// create filters for crews who are busy 
			var oStartDatePicker = this.byId("startDatePickerForCrew"),
				oStartDate = oStartDatePicker.getDateValue(),
				oEndDatePicker = this.byId("endDatePickerForCrew"),
				oEndDate = oEndDatePicker.getDateValue(),
				oModel = this.getModel(),
				oViewModel = this.getModel("workForceView"),
				sProjectID = this.getModel("appView").getProperty("/selectedProjectID"),
				oProjectFilter,
				aTaskFilters = [],
				oTaskFilter,
				aOverlappingTaskFilters = [],
				oOverlappingTaskFilter,
				aBusyCrewFilters = [],
				aCombinedFilters = [],
				that = this;

			if (oStartDate.getTime() >= oEndDate.getTime()) {
				oEndDatePicker.setValueState("Error");
				oEndDatePicker.setValueStateText(this.getResourceBundle().getText("errorEndDate"));
				return;
			} else {
				oEndDatePicker.setValueState("None");
				oEndDatePicker.setValueStateText("");
			}
			// build filters of busy crews
			oProjectFilter = new Filter("project_ID", sap.ui.model.FilterOperator.EQ, sProjectID);
			// first find all tasks within the dateRange
			aTaskFilters.push(new Filter("plannedStart", sap.ui.model.FilterOperator.BT, oStartDate, oEndDate));
			aTaskFilters.push(new Filter("actualStart", sap.ui.model.FilterOperator.BT, oStartDate, oEndDate));
			aTaskFilters.push(new Filter("estimatedEnd", sap.ui.model.FilterOperator.BT, oStartDate, oEndDate));
			oTaskFilter = new Filter({
				filters: aTaskFilters,
				and: false
			});
			oViewModel.setProperty("/busy", true);
			oModel.read("/Tasks", {
				filters: [oProjectFilter, oTaskFilter],
				and: true,
				success: function (oData) {
					if (oData.results.length > 0) {
						// then find all crews for these tasks
						for (var i = 0; i < oData.results.length; i++) {
							aOverlappingTaskFilters.push(new Filter("task_ID", sap.ui.model.FilterOperator.EQ, oData.results[i].ID));
						}
						if (aOverlappingTaskFilters.length > 0) {
							oOverlappingTaskFilter = new Filter({
								filters: aOverlappingTaskFilters,
								and: false
							});
							aCombinedFilters.push(oOverlappingTaskFilter);
						}
						aCombinedFilters.push(oProjectFilter);
						oModel.read("/CrewsForTask", {
							filters: aCombinedFilters,
							and: true,
							success: function (oCrews) {
								for (var j = 0; j < oCrews.results.length; j++) {
									aBusyCrewFilters.push(new Filter("ID", sap.ui.model.FilterOperator.NE, oCrews.results[j].crew_ID));
								}
								oViewModel.setProperty("/busyCrewFilters", aBusyCrewFilters);
								that._refreshCrewList();
								oViewModel.setProperty("/busy", false);
							},
							error: function (oError) {
								Log.error("CrewsForTask read for busyCrews:" + JSON.stringify(oError));
								oViewModel.setProperty("/busy", false);
							}
						});
					} else {
						oViewModel.setProperty("/busyCrewFilters", undefined);
						oViewModel.setProperty("/busy", false);
						that._refreshCrewList();
					}
				},
				error: function (oError) {
					Log.error("Tasks read for busyCrews:" + JSON.stringify(oError));
					oViewModel.setProperty("/busy", false);
				}
			});
		},

		onCrewSelectionChange: function () {
			this.getModel("workForceView").setProperty("/crewSelected", this.byId("addCrewsList").getSelectedItems().length > 0);
		},

		onAddCrew: function () {
			var oModel = this.getModel(),
				aSelectedTaskIDs = this.getModel("appView").getProperty("/selectedTaskIDs"),
				sProjectID = this.getModel("appView").getProperty("/selectedProjectID"),
				aSelectedCrews = this.byId("addCrewsList").getSelectedItems(),
				sCrewID,
				sTaskPath,
				oTaskBC,
				aCrewsForTaskPaths = [],
				oCrewBC,
				aAssignedCrewIDs = [],
				i, j, k,
				that = this;

			for (i = 0; i < aSelectedCrews.length; i++) {
				aAssignedCrewIDs = [];
				sCrewID = aSelectedCrews[i].getBindingContext().getObject().ID;
				for (j = 0; j < aSelectedTaskIDs.length; j++) {
					// get the Task
					sTaskPath = "/" + oModel.createKey("Tasks", {
						ID: aSelectedTaskIDs[j]
					});
					oTaskBC = oModel.createBindingContext(sTaskPath);
					// get the assigned crews
					aCrewsForTaskPaths = oTaskBC.getProperty("crews");
					for (k = 0; k < aCrewsForTaskPaths.length; k++) {
						oCrewBC = oModel.createBindingContext("/" + aCrewsForTaskPaths[k]);
						aAssignedCrewIDs.push(oCrewBC.getProperty("crew_ID"));
					}
					// don't assign the same crew again
					if (!aAssignedCrewIDs.includes(sCrewID)) {
						oModel.createEntry("/CrewsForTask", {
							properties: {
								project_ID: sProjectID,
								crew_ID: sCrewID,
								task_ID: aSelectedTaskIDs[j]
							}
						});
					}
				}
			}
			that.getModel("workForceView").setProperty("/busy", true);
			oModel.submitChanges({
				success: function (oData) {
					that.byId("addCrewsList").removeSelections(true);
					that._refreshCrewList();
					that.getModel("workForceView").setProperty("/crewSelected", false);
					that.getModel("workForceView").setProperty("/busy", false);
					that._fillOModelWithNewWorkers(aSelectedTaskIDs).then(function () {
						that.updatePlannedLaborCostOfTasks(aSelectedTaskIDs);
					});
					//that.updatePlannedLaborCostOfTasks(aSelectedTaskIDs);
				},
				error: function (oError) {
					Log.error("Error creating CrewsForTask: " + JSON.stringify(oError));
					oModel.resetChanges();
					that.getModel("workForceView").setProperty("/busy", false);
				}
			});
		},

		_fillOModelWithNewWorkers: function (aTaskIDs) {
			// all tasks are locally available
			var oModel = this.getModel();

			return aTaskIDs.reduce(function (oProm, sTaskID) {
				//return oProm.then(function () {
				return new Promise(function () {
					var aFilter = [new Filter("task_ID", sap.ui.model.FilterOperator.EQ, sTaskID)];
					oModel.read("/CrewsForTask", {
						filters: aFilter,
						urlParameters: {
							expand: "crew, crew/crewMembers",
						},
						success: function (oData) {
							var x = 1;
						},
						error: function (oError) {
							Log.error("Error reading crew/crewMembers of task");
						}
					});
				});
			}, Promise.resolve());
		},

		_refreshCrewList: function () {
			var oCrewList = this.byId("addCrewsList"),
				sProjectID = this.getModel("appView").getProperty("/selectedProjectID"),
				aFilters = [new Filter("project_ID", sap.ui.model.FilterOperator.EQ, sProjectID)],
				aBusyCrewFilters = this.getModel("workForceView").getProperty("/busyCrewFilters"),
				sTaskPath = this.getView().getBindingContext().getPath(), // bindingContext might not be available
				aExistingCrewFilters = sTaskPath ? this._getInitialExistingCrewFilters(sTaskPath) : [];

			if (aBusyCrewFilters && aBusyCrewFilters.length > 0) {
				for (var i = 0; i < aBusyCrewFilters.length; i++) {
					aFilters.push(aBusyCrewFilters[i]);
				}
			}
			if (aExistingCrewFilters && aExistingCrewFilters.length > 0) {
				for (i = 0; i < aExistingCrewFilters.length; i++) {
					aFilters.push(aExistingCrewFilters[i]);
				}
			}
			oCrewList.getBinding("items").filter(new Filter({
				filters: aFilters,
				and: true
			}));
		},

		_indicateSuitableCrews: function () {
			var aAddCrewListItems = this.byId("addCrewsList").getItems(),
				aSkillItems = this.byId("requiredSkillsList").getItems(),
				oModel = this.getModel(),
				aRequiredSkills = [],
				sProfessionCode,
				sProfessionDisciplineCode,
				sExperienceCode,
				aCrewMemberSkills = [],
				aSortedCrewSkills,
				iSkillsMatched,
				aCrewMemberPaths = [],
				getCrewMemberSkills = function (oAddCrewItem) {
					var aCrewSkills = [],
						oPersonBC;
					aCrewMemberPaths = oAddCrewItem.getBindingContext().getProperty("crewMembers");
					aCrewMemberPaths.forEach(function (sPersonPath) {
						oPersonBC = oModel.createBindingContext("/" + sPersonPath);
						aCrewSkills.push({
							profession: oPersonBC.getProperty("profession/code"),
							discipline: oPersonBC.getProperty("profession/discipline/code"),
							experience: oPersonBC.getProperty("experience/code"),
							crewSkillMatched: false
						});
					});
					return aCrewSkills;
				},
				getSkillMatch = function (aReqSkills, aCrewSkills) {
					iSkillsMatched = 0;
					// sort so that least experience will be checked first
					aSortedCrewSkills = aCrewSkills.sort(function (a, b) {
						return (b.profession + b.discipline + b.experience) - (a.profession + a.discipline + a.experience);
					});
					for (var i = 0; i < aReqSkills.length; i++) {
						for (var j = 0; j < aSortedCrewSkills.length; j++) {
							if (!aSortedCrewSkills[j].crewSkillMatched) { // don't check if already succeeded in a match
								if (aReqSkills[i].profession === aSortedCrewSkills[j].profession &&
									aReqSkills[i].discipline === aSortedCrewSkills[j].discipline &&
									aReqSkills[i].experience >= aSortedCrewSkills[j].experience) {
									iSkillsMatched += 1;
									aSortedCrewSkills[j].crewSkillMatched = true;
									break;
								}
							}
						}
					}
					if (iSkillsMatched >= aReqSkills.length) {
						return sap.ui.core.MessageType.Success;
					} else if (iSkillsMatched === 0) {
						return sap.ui.core.MessageType.Error;
					} else {
						return sap.ui.core.MessageType.Warning;
					}
				};

			if (!aAddCrewListItems || aAddCrewListItems.length === 0) {
				return;
			}
			if (!aSkillItems || aSkillItems.length === 0) {
				aAddCrewListItems.forEach(function (oCrew, i) {
					aAddCrewListItems[i].setHighlight(sap.ui.core.MessageType.None);
				});
				return;
			}
			aSkillItems.forEach(function (oSkillItem) {
				sProfessionCode = oSkillItem.getBindingContext().getProperty("skill/profession/code");
				sProfessionDisciplineCode = oSkillItem.getBindingContext().getProperty("skill/profession/discipline/code");
				sExperienceCode = oSkillItem.getBindingContext().getProperty("skill/experience/code");
				aRequiredSkills.push({
					profession: sProfessionCode,
					discipline: sProfessionDisciplineCode,
					experience: sExperienceCode,
					skillMatched: false
				});
			});
			aAddCrewListItems.forEach(function (oCrew, i) {
				aCrewMemberSkills = getCrewMemberSkills(oCrew);
				aAddCrewListItems[i].setHighlight(getSkillMatch(aRequiredSkills, aCrewMemberSkills));
			});
		},

		onNavBack: function () {
			var sPreviousHash = History.getInstance().getPreviousHash();

			if (sPreviousHash !== undefined) {
				history.go(-1);
			} else {
				this.getRouter().navTo("object", {
					no: 0
				}, true);
			}
		},

		onSkillsListForWorkForceUpdateFinished: function (oEvent) {
			var oSkillsList = this.byId("requiredSkillsList"),
				sTitle,
				iTotalItems = oEvent.getParameter("total"),
				oViewModel = this.getModel("workForceView");

			if (oSkillsList.getBinding("items").isLengthFinal()) {
				if (iTotalItems) {
					sTitle = this.getResourceBundle().getText("skillsListForCrewTitle", [iTotalItems]);
				} else {
					sTitle = this.getResourceBundle().getText("skillsListForCrewTitleEmpty");
				}
				oViewModel.setProperty("/skillsForCrewListTitle", sTitle);
				oViewModel.setProperty("/requiredSkillsCount", iTotalItems);
			}
		},

		onCrewListUpdateFinished: function (oEvent) {
			var oCrewList = this.byId("addCrewsList"),
				sTitle,
				iTotalItems = oEvent.getParameter("total"),
				oViewModel = this.getModel("workForceView");

			// only update the counter if the length is final
			if (oCrewList.getBinding("items").isLengthFinal()) {
				if (iTotalItems) {
					sTitle = this.getResourceBundle().getText("taskAddCrewTableHeadingCount", [iTotalItems]);
				} else {
					sTitle = this.getResourceBundle().getText("taskAddCrewTableHeading");
				}
				oViewModel.setProperty("/addCrewListTitle", sTitle);
				oViewModel.setProperty("/crewCount", iTotalItems);
				this._indicateSuitableCrews();
			}
		},

		crewMembersFormatter: function (aCrewMembers) {
			var sTooltip = "",
				oModel = this.getModel(),
				oBC;

			for (var i = 0; i < aCrewMembers.length; i++) {
				oBC = oModel.createBindingContext("/" + aCrewMembers[i]);
				sTooltip += oBC.getProperty("lastName") + " " + oBC.getProperty("firstName") + ": " +
					oBC.getProperty("profession/description") + " " + oBC.getProperty("experience/code");
				if (i === aCrewMembers.length - 1) {
					break;
				} else {
					sTooltip += "\n";
				}
			}
			return sTooltip;
		},

		crewMembersHeadCount: function (aCrewMembers) {
			return aCrewMembers.length;
		},

		//////////////////////////////////////// WORKERS TAB //////////////////////////////////////////

		_getInitialExistingWorkerFilters: function (sObjectPath) {
			var aExistingWorkers = this.getModel().createBindingContext(sObjectPath).getProperty("workers"),
				sProjectID = this.getModel("appView").getProperty("/selectedProjectID"),
				oModel = this.getModel(),
				sWorkerID,
				aFilters = [];

			if (this.getModel("appView").getProperty("/selectedTaskIDs").length > 0) {
				return []; // if multiple tasks are selected don't exclude existing workers
			}
			// exclude existing crew assignments from crew selection list
			for (var i = 0; i < aExistingWorkers.length; i++) {
				//sCrewID = aExistingCrews[i].getBindingContext().getPropwerty("crew_ID");
				sWorkerID = oModel.createBindingContext("/" + aExistingWorkers[i]).getProperty("worker_ID");
				aFilters.push(new Filter("ID", sap.ui.model.FilterOperator.NE, sWorkerID));
			}
			return aFilters;
		},

		_refreshWorkerList: function () {
			var oWorkerList = this.byId("addWorkersList"),
				sProjectID = this.getModel("appView").getProperty("/selectedProjectID"),
				aFilters = [],
				aSkillFilters = this.getModel("workForceView").getProperty("/skillFilters"),
				aBusyWorkerFilters = this.getModel("workForceView").getProperty("/busyWorkerFilters"),
				sTaskPath = this.getView().getBindingContext().getPath(),
				aExistingWorkerAssignments = sTaskPath ? this._getInitialExistingWorkerFilters(sTaskPath) : [];

			// only workers of the current project: found in WorkerDeployments 
			if (sProjectID) {
				aFilters.push(new Filter("deployment/project_ID", sap.ui.model.FilterOperator.EQ, sProjectID));
			}
			// worker also must not be assigned to a crew
			aFilters.push(new Filter("memberOfCrew_ID", sap.ui.model.FilterOperator.EQ, null));

			if (aSkillFilters && aSkillFilters.length > 0) {
				for (var i = 0; i < aSkillFilters.length; i++) {
					aFilters.push(aSkillFilters[i]);
				}
			}
			if (aBusyWorkerFilters && aBusyWorkerFilters.length > 0) {
				for (i = 0; i < aBusyWorkerFilters.length; i++) {
					aFilters.push(aBusyWorkerFilters[i]);
				}
			}
			if (aExistingWorkerAssignments && aExistingWorkerAssignments.length > 0) {
				for (i = 0; i < aExistingWorkerAssignments.length; i++) {
					aFilters.push(aExistingWorkerAssignments[i]);
				}
			}
			oWorkerList.getBinding("items").filter(new Filter({
				filters: aFilters,
				and: true
			}));
		},

		onWorkerSelectionChange: function () {
			this.getModel("workForceView").setProperty("/workerSelected", this.byId("addWorkersList").getSelectedItems().length > 0);
		},

		onAddWorker: function () {
			var oModel = this.getModel(),
				aSelectedTaskIDs = this.getModel("appView").getProperty("/selectedTaskIDs"),
				sProjectID = this.getModel("appView").getProperty("/selectedProjectID"),
				aSelectedWorkers = this.byId("addWorkersList").getSelectedItems(),
				sWorkerID,
				sTaskPath,
				oTaskBC,
				aWorkersForTaskPaths = [],
				oWorkerBC,
				aAssignedWorkerIDs = [],
				i, j, k,
				that = this;

			for (i = 0; i < aSelectedWorkers.length; i++) {
				sWorkerID = aSelectedWorkers[i].getBindingContext().getObject().ID;
				for (j = 0; j < aSelectedTaskIDs.length; j++) {
					// get the Task
					sTaskPath = "/" + oModel.createKey("Tasks", {
						ID: aSelectedTaskIDs[j]
					});
					oTaskBC = oModel.createBindingContext(sTaskPath);
					// get the assigned crews
					aWorkersForTaskPaths = oTaskBC.getProperty("workers");
					for (k = 0; k < aWorkersForTaskPaths.length; k++) {
						oWorkerBC = oModel.createBindingContext("/" + aWorkersForTaskPaths[k]);
						aAssignedWorkerIDs.push(oWorkerBC.getProperty("worker_ID"));
					}
					// don't assign the same worker again
					if (!aAssignedWorkerIDs.includes(sWorkerID)) {
						oModel.createEntry("/WorkersForTask", {
							properties: {
								project_ID: sProjectID,
								worker_ID: sWorkerID,
								task_ID: aSelectedTaskIDs[j]
							}
						});
					}
				}
			}
			that.getModel("workForceView").setProperty("/busy", true);
			oModel.submitChanges({
				success: function (oData) {
					that.byId("addWorkersList").removeSelections(true);
					that._refreshWorkerList();
					that.getModel("workForceView").setProperty("/workerSelected", false);
					that.getModel("workForceView").setProperty("/busy", false);
					that.updatePlannedLaborCostOfTasks(aSelectedTaskIDs);
				},
				error: function (oError) {
					Log.error("Error creating WorkersForTask :" + JSON.stringify(oError));
					oModel.resetChanges();
					that.getModel("workForceView").setProperty("/busy", false);
				}
			});
		},

		onSwitchAvailableWorkers: function (oEvent) {
			var bSwitchOn = oEvent.getParameter("state"),
				oModel = this.getModel(),
				oStartDatePicker = this.byId("startDatePickerWorker"),
				oEndDatePicker = this.byId("endDatePickerWorker"),
				oInfoToolbar = this.byId("infoToolbarWorker"),
				oTask = this.getView().getBindingContext().getObject(),
				aSelectedTaskIDs = this.getModel("appView").getProperty("/selectedTaskIDs"),
				sTaskPath,
				oMinDate = (oTask.status > 1) ? oTask.actualStart : oTask.plannedStart,
				oMaxDate = oTask.estimatedEnd;

			if (oStartDatePicker.getValueState() === "Error") {
				return;
			}
			if (aSelectedTaskIDs.lenth === 1) {
				if (oTask.status > 1) {
					oStartDatePicker.setDateValue(oTask.actualStart);
				} else {
					oStartDatePicker.setDateValue(oTask.plannedStart);
				}
			} else {
				for (var i = 0; i < aSelectedTaskIDs.length; i++) {
					sTaskPath = "/" + oModel.createKey("Tasks", {
						ID: aSelectedTaskIDs[i]
					});
					oTask = oModel.getObject(sTaskPath);
					if (oTask.status > 1) {
						oMinDate = (oMinDate > oTask.actualStart) ? oTask.actualStart : oMinDate;
					} else {
						oMinDate = (oMinDate > oTask.plannedStart) ? oTask.plannedStart : oMinDate;
					}
					oMaxDate = (oMaxDate < oTask.estimatedEnd) ? oTask.estimatedEnd : oMaxDate;
				}
				oStartDatePicker.setDateValue(oMinDate);
				oEndDatePicker.setDateValue(oMaxDate);
			}
			oInfoToolbar.setVisible(bSwitchOn);
			if (!bSwitchOn) {
				this.getModel("workForceView").setProperty("/busyWorkerFilters", undefined);
				this._refreshWorkerList();
			} else {
				this.onWorkerSearchDateChanged();
			}
		},

		onWorkerSearchDateChanged: function () {
			// create filters for workers who are busy 
			var oStartDatePicker = this.byId("startDatePickerWorker"),
				oStartDate = oStartDatePicker.getDateValue(),
				oEndDatePicker = this.byId("endDatePickerWorker"),
				oEndDate = oEndDatePicker.getDateValue(),
				oModel = this.getModel(),
				oViewModel = this.getModel("workForceView"),
				sProjectID = this.getModel("appView").getProperty("/selectedProjectID"),
				oProjectFilter,
				aTaskFilters = [],
				oTaskFilter,
				aOverlappingTaskFilters = [],
				oOverlappingTaskFilter,
				aBusyWorkerFilters = [],
				that = this;

			if (oStartDate.getTime() >= oEndDate.getTime()) {
				oEndDatePicker.setValueState("Error");
				oEndDatePicker.setValueStateText(this.getResourceBundle().getText("errorEndDate"));
				return;
			} else {
				oEndDatePicker.setValueState("None");
				oEndDatePicker.setValueStateText("");
			}
			// build filters of busy workers
			oProjectFilter = new Filter("project_ID", sap.ui.model.FilterOperator.EQ, sProjectID);
			// first find all tasks within the dateRange
			aTaskFilters.push(new Filter("plannedStart", sap.ui.model.FilterOperator.BT, oStartDate, oEndDate));
			aTaskFilters.push(new Filter("actualStart", sap.ui.model.FilterOperator.BT, oStartDate, oEndDate));
			aTaskFilters.push(new Filter("estimatedEnd", sap.ui.model.FilterOperator.BT, oStartDate, oEndDate));
			oTaskFilter = new Filter({
				filters: aTaskFilters,
				and: false
			});
			oViewModel.setProperty("/busy", true);
			oModel.read("/Tasks", {
				filters: [oProjectFilter, oTaskFilter],
				and: true,
				success: function (oData) {
					Log.info("Tasks read for overlapping tasks:" + JSON.stringify(oData.results));
					if (oData.results.length > 0) {
						// then find all workers for these tasks
						for (var i = 0; i < oData.results.length; i++) {
							aOverlappingTaskFilters.push(new Filter("task_ID", sap.ui.model.FilterOperator.EQ, oData.results[i].ID));
						}
						oOverlappingTaskFilter = new Filter({
							filters: aOverlappingTaskFilters,
							and: false
						});
						oModel.read("/WorkersForTask", {
							filters: [oProjectFilter, oOverlappingTaskFilter],
							and: true,
							success: function (oWorkers) {
								if (oWorkers.results.length > 0) {
									Log.info("WorkersForTask read for busy workers:" + JSON.stringify(oData.results));
									for (var j = 0; j < oWorkers.results.length; j++) {
										aBusyWorkerFilters.push(new Filter("ID", sap.ui.model.FilterOperator.NE, oWorkers.results[j].worker_ID));
									}
									oViewModel.setProperty("/busyWorkerFilters", aBusyWorkerFilters);
								} else {
									oViewModel.setProperty("/busyWorkerFilters", undefined);
								}
								that._refreshWorkerList();
								oViewModel.setProperty("/busy", false);
							},
							error: function (oError) {
								Log.error("WorkersForTask read for busyWorker:" + JSON.stringify(oError));
								oViewModel.setProperty("/busy", false);
							}
						});
					} else {
						oViewModel.setProperty("/busy", false);
					}
				},
				error: function (oError) {
					Log.error("Tasks read for busyWorker:" + JSON.stringify(oError));
					oViewModel.setProperty("/busy", false);
				}
			});
		},

		onAddWorkerListUpdateFinished: function (oEvent) {
			var oWorkerList = this.byId("addWorkersList"),
				oSkillsList = this.byId("requiredSkillsList"),
				sTitle,
				iTotalItems = oEvent.getParameter("total"),
				oViewModel = this.getModel("workForceView");

			// only update the counter if the length is final
			if (oWorkerList.getBinding("items").isLengthFinal()) {
				if (oSkillsList.getSelectedItem()) { // filtered by skill
					if (iTotalItems) {
						sTitle = this.getResourceBundle().getText("taskAddWorkerTableHeadingCount", [iTotalItems]);
					} else {
						sTitle = this.getResourceBundle().getText("taskAddWorkerTableHeadingCountFilteredEmpty");
					}
				} else {
					if (iTotalItems) {
						sTitle = this.getResourceBundle().getText("taskAddWorkerTableHeadingCountUnfiltered", [iTotalItems]);
					} else {
						sTitle = this.getResourceBundle().getText("taskAddWorkerTableHeading");
					}
				}
				oViewModel.setProperty("/addWorkerListTitle", sTitle);
				oViewModel.setProperty("/workerCount", iTotalItems);
			}
		},

		onSkillSelect: function (oEvent) {
			var oItemBC = oEvent.getParameter("listItem").getBindingContext(),
				aSkillFilters = [
					new Filter("profession/description", sap.ui.model.FilterOperator.EQ, oItemBC.getProperty("skill/profession/description")),
					new Filter("profession/discipline/code", sap.ui.model.FilterOperator.EQ, oItemBC.getProperty("skill/profession/discipline/code")),
					new Filter("experience/code", sap.ui.model.FilterOperator.LE, oItemBC.getProperty("skill/experience/code"))
				];
			this.getModel("workForceView").setProperty("/skillSelected", true);
			this.getModel("workForceView").setProperty("/skillFilters", aSkillFilters);
			this._refreshWorkerList();
		},

		onClearSkillFilter: function () {
			this.byId("clearSkillFilterButton").setEnabled(false);
			this.byId("requiredSkillsList").removeSelections(true);
			this.getModel("workForceView").setProperty("/skillFilters", undefined);
			this.getModel("workForceView").setProperty("/skillSelected", false);
			this._refreshWorkerList();
		},

		//////////////////////////////////////// OTHER //////////////////////////////////////////

		onTabSelected: function (oEvent) {
			var sKey = oEvent.getParameter("selectedKey"),
				oViewModel = this.getModel("workForceView"),
				iSkillsCount = oViewModel.getProperty("/requiredSkillsCount"),
				sTitle = "";

			if (sKey.includes("iconTabFilterCrews")) { // crew tab selected
				this.byId("requiredSkillsList").setMode(sap.m.ListMode.None);
				oViewModel.setProperty("/workerTabSelected", false);
				if (iSkillsCount > 0) {
					sTitle = this.getResourceBundle().getText("skillsListForCrewTitle", [iSkillsCount]);
				} else {
					sTitle = this.getResourceBundle().getText("skillsListForCrewTitleEmpty");
				}
			} else { // worker tab selected
				this.byId("requiredSkillsList").setMode(sap.m.ListMode.SingleSelectMaster);
				oViewModel.setProperty("/workerTabSelected", true);
				if (iSkillsCount > 0) {
					sTitle = this.getResourceBundle().getText("skillsListTitle", [iSkillsCount]);
				} else {
					sTitle = this.getResourceBundle().getText("skillsListTitleEmpty");
				}
			}
			oViewModel.setProperty("/skillsForCrewListTitle", sTitle);
		},

		getDiscipline: function (oContext) {
			var oDiscipline = oContext.getProperty("profession/discipline"),
				oGroup,
				sNoDiscipline = this.getResourceBundle().getText("noDisciplineAssigned");

			if (oDiscipline) {
				oGroup = {
					key: oDiscipline.code,
					description: oDiscipline.description
				};
			} else {
				oGroup = {
					key: null,
					description: sNoDiscipline
				};
			}
			return oGroup;
		},

		createGroupHeader: function (oGroup) {
			var sText = (oGroup.key) ? oGroup.key + " " + oGroup.description : oGroup.description;
			return new GroupHeaderListItem({
				title: sText,
				upperCase: false
			});
		},

		onCloseWorkForcePress: function () {
			this.getModel("appView").setProperty("/actionButtonsInfo/midColumn/fullScreen", false);
			this.getModel("appView").setProperty("/mode", "None");
			this.getModel("appView").setProperty("/selectedTaskIDs", []);
			this.getRouter().navTo("object", {
				no: "0"
			}, true);
		},

		/**
		 * Toggle between full and non full screen mode.
		 */
		toggleFullScreen: function () {
			var bFullScreen = this.getModel("appView").getProperty("/actionButtonsInfo/endColumn/fullScreen");
			this.getModel("appView").setProperty("/actionButtonsInfo/endColumn/fullScreen", !bFullScreen);
			if (!bFullScreen) {
				// store current layout and go full screen
				this.getModel("appView").setProperty("/previousLayout", this.getModel("appView").getProperty("/layout"));
				this.getModel("appView").setProperty("/layout", "EndColumnFullScreen");
			} else {
				// reset to previous layout
				this.getModel("appView").setProperty("/layout", this.getModel("appView").getProperty("/previousLayout"));
			}
		}

	});
});
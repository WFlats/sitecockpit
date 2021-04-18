sap.ui.define([
	"./BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/ui/Device",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator",
	"sap/ui/model/Sorter",
	"sap/ui/core/Fragment",
	"sap/m/Dialog",
	"sap/m/MessageToast",
	"sap/m/MessageBox",
	"../model/formatter",
	"sap/m/library",
	"sap/base/Log"
], function (BaseController, JSONModel, Device, Filter, FilterOperator, Sorter, Fragment, Dialog, MessageToast, MessageBox, formatter,
	mobileLibrary, Log) {
	"use strict";

	// shortcut for sap.m.URLHelper
	var URLHelper = mobileLibrary.URLHelper;

	return BaseController.extend("cockpit.Cockpit.controller.Detail", {

		formatter: formatter,

		onInit: function () {
			this._oResourceBundle = this.getResourceBundle();
			this._oODataModel = this.getOwnerComponent().getModel();
			var oStateModel = this._createViewModel();
			this.setModel(oStateModel, "stateModel");

			this._oLocationRowFilterState = {
				aLocationRowFilter: new Filter({
					filters: [],
					and: false
				})
			};
			// for task filters
			this._oTaskFilterState = {
				aDisciplineFilter: [],
				aCompanyFilter: [],
				aCrewFilter: [],
				aWorkerFilter: [],
				aForemanFilter: [],
				aProductivityRange: ["0", "200"],
				iStatus: -1
			};

			// if tab was used and is released keyboard use is detected
			this.byId("menuButton").attachBrowserEvent("tab keyup", function (oEvent) {
				this._bKeyboard = oEvent.type === "keyup";
			}, this);

			// register event handlers
			var oPC = this.byId("planningBoard");
			oPC.attachEvent("dataRequested", function () {
				oStateModel.setProperty("/busy", true);
			});
			oPC.attachEvent("dataReceived", function () {
				oStateModel.setProperty("/busy", false);
			});
			// define context menu
			oPC.oncontextmenu = function (oEvent) {
				// select task if possible
				var oTarget = oEvent.originalEvent.target,
					sInnerText = oTarget.offsetParent.innerText,
					sTitle = sInnerText.slice(0, sInnerText.lastIndexOf(")") + 1),
					oTask = this._findTask(sTitle);
				// if no task is selected, try finding it onContext and select it
				if (oTarget.className.includes("sapUiCalendarApp") && oTask) {
					if (oStateModel.getProperty("/noOfSelectedTasks") === 0) {
						oTask.setSelected(true);
						oStateModel.setProperty("/selectedTaskID", oTask.getBindingContext().getObject().ID);
						oStateModel.setProperty("/noOfSelectedTasks", 1);
					}
					this.getModel("appView").setProperty("/activeRowID", oTask.getParent().getBindingContext().getObject().ID);
					this.getModel("appView").setProperty("/activeStartDate", new Date(oTask.getEndDate().getTime() +
						oTask.getBindingContext().getProperty("waitDuration"))); // in case wait is not visible
					this.getModel("appView").setProperty("/activeEndDate", oTask.getStartDate());
				} else { // try finding row (and date)
					var oElement = document.elementFromPoint(oEvent.pageX, oEvent.pageY), // finds an interval placeholder which cannot be retrieved
						sIntervalID = oElement.id,
						sRowID = sIntervalID.slice(0, sIntervalID.indexOf("-CalRow-AppsInt")),
						oRow = this.byId(sRowID),
						sUUID = "",
						sCode;
					//oParent = $("#" + sIntervalID).parent();
					if (oRow) {
						sUUID = oRow.getBindingContext().getProperty("ID");
						sCode = oRow.getBindingContext().getProperty("code");
						this.getModel("appView").setProperty("/activeRowID", sUUID);
						this.getModel("appView").setProperty("/activeRowCode", sCode);
						oStateModel.setProperty("/selectedTaskID", "");
						oStateModel.setProperty("/noOfSelectedTasks", 0);
					}
				}

				// open menu
				oEvent.preventDefault();
				if (!this._menu) {
					this._menu = sap.ui.xmlfragment("cockpit.Cockpit.view.MainMenu", this);
					this.getView().addDependent(this._menu);
				}
				this._enableMenuItems();
				var eDock = sap.ui.core.Popup.Dock;
				this._menu.open(false, oTarget, eDock.BeginTop, eDock.BeginBottom, oTarget);
			}.bind(this);

			oPC.ondblclick = function (oEvent) {
				// select task if possible
				var aSelectedAppointments = this.byId("planningBoard").getSelectedAppointments(),
					oTarget = oEvent.originalEvent.target,
					sInnerText = oTarget.offsetParent.innerText,
					sTitle = sInnerText.slice(0, sInnerText.lastIndexOf(")") + 1),
					oTask = this._findTask(sTitle),
					oRow,
					sObjectID,
					bReplace;
				// deselect existing selections	
				for (var i = 0; i < aSelectedAppointments.length; i++) {
					//this.byId(aSelectedAppointments[i]).setSelected(false);
					sap.ui.getCore().byId(aSelectedAppointments[i]).setSelected(false);
				}
				// try finding the task onContext and select it
				if (oTarget.className.includes("sapUiCalendarApp") && oTask) {
					oRow = oTask.getParent();
					oTask.setSelected(true);
					sObjectID = oTask.getBindingContext().getObject().ID;
					oStateModel.setProperty("/selectedTaskID", sObjectID);
					oStateModel.setProperty("/noOfSelectedTasks", 1);
					this._setModelsBasedOnSelections(oRow, oTask.getEndDate(), oTask.getStartDate());
					if (oPC.getSelectedAppointments().length === 1) {
						this.getModel("appView").setProperty("/mode", "Edit");
						bReplace = !Device.system.phone;
						this.getModel("appView").setProperty("/layout", "ThreeColumnsEndExpanded");
						this.getRouter().navTo("Task", {
							ID: sObjectID
						}, bReplace);
					}
				}
			}.bind(this);

			oPC.onkeydown = function (oEvent) {
				if (oEvent.keyCode === 120) {
					this.sequenceAllTasks();
				}
				if (oEvent.keyCode === 67 && (oEvent.ctrlKey || oEvent.metaKey)) {
					this.onCopy();
				}
			}.bind(this);

			oPC.onpaste = function (oEvent) {
				this.onPaste();
			}.bind(this);

			// abused: get the array of selected rows from the appViewModel
			this.getRouter().getRoute("object").attachPatternMatched(this._onObjectMatched, this);
		},

		_enableMenuItems: function () {
			var oStateModel = this.getModel("stateModel"),
				aSelectedTaskIDs = this.byId("planningBoard").getSelectedAppointments(),
				bAdd = (this.getModel("appView").getProperty("/activeRowID") !== ""),
				//bEdit = oStateModel.getProperty("/selectedTaskID") !== "",
				bEdit = aSelectedTaskIDs.length === 1,
				bMultiSelected = oStateModel.getProperty("/tasksMultiSelected"),
				bDelete = bMultiSelected || bEdit,
				bStatusChange = bDelete,
				bTrain = bDelete,
				bCopy = bDelete,
				bPaste = oStateModel.getProperty("/mode") === "Copy" &&
				oStateModel.getProperty("/tasksToCopy").length > 0 &&
				this.getModel("appView").getProperty("/activeStartDate") !== undefined,
				bAssign = bDelete,
				bMove = bDelete,
				bSequence = bMove,
				sMustBeTaskStatus = "",
				sCopyLocation = "",
				sMustBeRecipe = "",
				bForwardProductivity = bEdit,
				oTask,
				bPull = this.getModel("appView").getProperty("/pullMode");

			for (var i = 0; i < aSelectedTaskIDs.length; i++) {
				//oTask = this.byId(aSelectedTaskIDs[i]).getBindingContext().getObject();
				oTask = sap.ui.getCore().byId(aSelectedTaskIDs[i]).getBindingContext().getObject();
				bMove = bMove && oTask.status < 2; // can't move when started or later
				if (i === 0) {
					sMustBeTaskStatus = oTask.status;
					sCopyLocation = oTask.location_ID;
					sMustBeRecipe = oTask.recipe_ID;
				} else {
					bStatusChange = bStatusChange && sMustBeTaskStatus === oTask.status; // all must have same status
					bCopy = bCopy && sCopyLocation === oTask.location_ID; // all tasks must be in the same row
					bAssign = bAssign && sMustBeRecipe === oTask.recipe_ID; // all tasks must have the same recipe
					bSequence = bSequence && oTask.status < 2; // for sequencing the first task can be started or higher
				}
			}
			// all selected tasks in one row (bCopy) and more than one row
			bTrain = bCopy && this.byId("planningBoard").getRows().length > 1;
			// task must be started and measurement must exist
			bForwardProductivity = bEdit && sap.ui.getCore().byId(aSelectedTaskIDs[0]).getBindingContext().getProperty("status") > 1 &&
				sap.ui.getCore().byId(aSelectedTaskIDs[0]).getBindingContext().getProperty("measurements").length > 0;

			// 0: Add
			// 1: Edit
			// 2: Delete
			// 3: Move
			// 3.0 To next shift start
			// 3.1 By hh:mm
			// 4: Sequence
			// 4.0 Sequence all tasks
			// 4.1 Sequence selected
			// 4.2 Sequence same
			// 4.3 Sequence row
			// 5: Copy
			// 6: Paste
			// 7: Create trains
			// 8: Next status
			// 9: Propagate productivity
			// 10: Assign ressources
			// 10.2: Workforce
			// 10.2: Foreman
			var aMenuItems = this._menu.getItems(),
				aSubMenuItems = aMenuItems[3].getSubmenu().getItems(),
				aSubMenuItems2 = aMenuItems[4].getSubmenu().getItems(),
				aSubMenuItems3 = aMenuItems[10].getSubmenu().getItems();
			aMenuItems[0].setEnabled(bAdd);
			aMenuItems[1].setEnabled(bEdit);
			aMenuItems[2].setEnabled(bDelete);
			aMenuItems[3].setEnabled(true);
			aSubMenuItems[0].setEnabled(bMove); // to next shift start
			aSubMenuItems[1].setEnabled(bMove); // by hh:mm
			aMenuItems[4].setEnabled(true); // sequence
			aSubMenuItems2[0].setEnabled(true); // sequence all tasks
			aSubMenuItems2[1].setEnabled(bMultiSelected && bSequence); // sequence selected
			aSubMenuItems2[2].setEnabled(bEdit && !bMultiSelected && !bPull); // sequence same
			aSubMenuItems2[3].setEnabled(bEdit && !bMultiSelected && !bPull); // sequence row
			aMenuItems[5].setEnabled(bCopy);
			aMenuItems[6].setEnabled(bPaste);
			aMenuItems[7].setEnabled(bTrain);
			aMenuItems[8].setEnabled(bStatusChange);
			aMenuItems[9].setEnabled(bForwardProductivity);
			aMenuItems[10].setEnabled(bAssign);
			aSubMenuItems3[0].setEnabled(bAssign);
			aSubMenuItems3[1].setEnabled(bDelete);
		},

		_findTask: function (sTitle) { // title inc. number is unique
			var aRows = this.byId("planningBoard").getRows(),
				aTasks;
			for (var i = 0; i < aRows.length; i++) {
				aTasks = aRows[i].getAppointments();
				for (var j = 0; j < aTasks.length; j++) {
					if (aTasks[j].getTitle() === sTitle) {
						return aTasks[j];
					}
				}
			}
			return undefined;
		},

		_onObjectMatched: function (oEvent) {
			var oPC = this.byId("planningBoard"),
				aRowIDs = this.getModel("appView").getProperty("/selectedRowIDs"),
				sProjectID = this.getModel("appView").getProperty("/selectedProjectID"),
				aFilters = [],
				aCombinedFilter = [],
				aSorter = [],
				oWorkTimeModel = this.getModel("workTimeModel"),
				sNo = oEvent.getParameter("arguments").no;

			this.getModel("appView").setProperty("/layout", "TwoColumnsMidExpanded");
			// if sNo === "0" and there are rows then it's a nav back from Recipes or Tasks; all values are already set
			if (sNo === "0" && aRowIDs.length > 0) {
				this.getModel("appView").setProperty("/mode", "None");
				this._setModelsBasedOnSelections(); // tasks get deselected 
				return;
			}
			if (aRowIDs.length > 0) {
				for (var i = 0; i < aRowIDs.length; i++) {
					aFilters.push(new Filter({
						path: "ID",
						operator: sap.ui.model.FilterOperator.EQ,
						value1: aRowIDs[i]
					}));
				}
				aCombinedFilter = new Filter({
					filters: aFilters,
					and: false
				});
			} else {
				aCombinedFilter = new Filter("nodeID", sap.ui.model.FilterOperator.EQ, null); // nothing shall be found
			}

			this.getModel("stateModel").setProperty("/busy", true);
			aSorter = new Sorter("code");
			var oRowBinding = oPC.getBinding("rows");
			oRowBinding.filter(aCombinedFilter, "Application");
			oRowBinding.sort(aSorter);

			this._setModelsBasedOnSelections();
			this._oLocationRowFilterState.aLocationRowFilter = aCombinedFilter;

			// fill the work times model only once
			if (!oWorkTimeModel || oWorkTimeModel.getProperty("/shifts").length === 0) {
				var that = this;
				this._loadShifts(sProjectID).then(function (oWorkTimes) {
					if (oWorkTimes.shifts.length === 0) {
						var sText = "Error: Worktime model not loaded correctly";
						MessageBox.error(sText, {
							icon: MessageBox.Icon.ERROR,
							title: "Work Time Model Error",
							actions: [sap.m.MessageBox.Action.OK],
							onClose: function (sAction) {
								return;
							}
						});
					}
					that.getModel("stateModel").setProperty("/busy", false);
				});
			} else {
				this.getModel("stateModel").setProperty("/busy", false);
			}
			// load the filter select values
			if (!this.getModel("stateModel").getProperty("/filterSelectLoaded")) {
				this._loadFilterSelectValues();
				this.getModel("stateModel").setProperty("/filterSelectLoaded", true);
			}
		},

		onWaitPressed: function () {
			this.onRefresh();
		},

		onRefresh: function () {
			var aRows = this.byId("planningBoard").getRows();
			for (var i = 0; i < aRows.length; i++) {
				aRows[i].getBinding("appointments").refresh();
			}
		},

		/////////////////////////////// Task Operations ///////////////////////////////////

		handleAppointmentDragEnter: function (oEvent) {
			var oAppointment = oEvent.getParameter("appointment"),
				oAppBindingContext = oAppointment.getBindingContext(),
				bCopy = oEvent.getParameter("copy");
			if (oAppBindingContext.getProperty("status") > 1 && !bCopy) {
				MessageToast.show(this.getResourceBundle().getText("taskDragError"));
			}
		},

		handleAppointmentDrop: function (oEvent) {
			var oAppointment = oEvent.getParameter("appointment"),
				oStartDate = oEvent.getParameter("startDate"),
				oEndDate = oEvent.getParameter("endDate"),
				oCalendarRow = oEvent.getParameter("calendarRow"),
				bCopy = oEvent.getParameter("copy"),
				oModel = this.getModel(),
				oAppBindingContext = oAppointment.getBindingContext(),
				oRowBindingContext = oCalendarRow.getBindingContext(),
				sLocationID = oRowBindingContext.getObject().ID,
				oTask = oModel.getObject(oAppBindingContext.getPath(), {
					select: "*"
				}),
				oStateModel = this.getModel("stateModel"),
				sProjectID = this.getModel("appView").getProperty("/selectedProjectID"),
				oShift = this.getShiftFromID(oTask.shift_ID),
				bPull = this.getModel("appView").getProperty("/pullMode"),
				oOverlappingStartDate,
				that = this;

			if (oTask.status > 1 && !bCopy) {
				var sErrorMessage = this.getResourceBundle().getText("taskDragError");
				MessageToast.show(sErrorMessage);
				return;
			}
			// check if dates overlap with an existing task; if so then snap the dragged task to it
			var aExistingTasks = this.getTasksOfRow(sLocationID, oTask.ID);
			// getOverlappingTask returns the correct task depending on mode
			var oOverlappingTask = this.getOverlappingTask(aExistingTasks, oStartDate, oEndDate, bPull);
			// correct the end date from the event in case the task has waiting time (rest of calculations are with estimatedEnd)
			oEndDate = (oTask.waitDuration) ? new Date(oEndDate.getTime() - oTask.waitDuration) : oEndDate;
			if (oOverlappingTask) { // place before or after the overlapping task depending on pull mode
				if (bPull) {
					// if the dragged task has waiting time, deduct it
					oOverlappingStartDate = oOverlappingTask.actualStart ? new Date(oOverlappingTask.actualStart) : new Date(oOverlappingTask.plannedStart);
					oEndDate = oTask.waitDuration ? new Date(oOverlappingStartDate.getTime() - oTask.waitDuration) : new Date(oOverlappingStartDate);
					oEndDate = this.getPullEndDateInWorkingHours(oEndDate, oShift);
					oStartDate = this.getPullStartDateInWorkingHours(oEndDate, oTask.quantity, oTask.plannedProductivity * oTask.productivityFactor,
						oShift);
				} else {
					// if the overlapping task is in the past, set the start to the end of the overlapping task; if the overlapped task has waitig time, add it
					oOverlappingStartDate = oOverlappingTask.actualStart ? new Date(oOverlappingTask.actualStart) : new Date(oOverlappingTask.plannedStart);
					oStartDate = oOverlappingTask.waitDuration ? new Date(oOverlappingTask.estimatedEnd.getTime() + oOverlappingTask.waitDuration) :
						new Date(oOverlappingTask.estimatedEnd.getTime());
					oStartDate = this.getStartDateInWorkingHours(oStartDate, oShift);
					oEndDate = this.getEndDateInWorkingHours(oStartDate, oTask.quantity, oTask.plannedProductivity * oTask.productivityFactor, oShift);
				}
			} else {
				if (bPull) {
					oEndDate = this.getPullEndDateInWorkingHours(oEndDate, oShift);
					oStartDate = this.getPullStartDateInWorkingHours(oEndDate, oTask.quantity, oTask.plannedProductivity * oTask.productivityFactor,
						oShift);
				} else {
					oStartDate = this.getStartDateInWorkingHours(oStartDate, oShift);
					oEndDate = this.getEndDateInWorkingHours(oStartDate, oTask.quantity, oTask.plannedProductivity * oTask.productivityFactor, oShift);
				}
			}
			if (oStartDate < new Date()) {
				oCalendarRow.getBinding("appointments").refresh();
				MessageBox.error(this.getResourceBundle().getText("taskInPast"));
				return;
			}
			// check collissions with existing tasks
			oTask.plannedStart = oStartDate;
			oTask.plannedEnd = oEndDate;
			oTask.estimatedEnd = oEndDate;
			oTask.location_ID = sLocationID;
			this.checkCollisionWithExistingTasks(aExistingTasks, oTask);

			oStateModel.setProperty("/busy", true);
			if (bCopy) { // "copy" task
				this._nextTaskNumber(sProjectID, oTask.taskName).then(function (iNewNumber) {
					oTask.ID = undefined;
					oTask.plannedStart = oStartDate;
					oTask.plannedEnd = oEndDate;
					oTask.estimatedEnd = oEndDate;
					oTask.location_ID = sLocationID;
					oTask.number = iNewNumber;

					oModel.create("/Tasks", oTask, {
						success: function () {
							oStateModel.setProperty("/busy", false);
							oCalendarRow.getBinding("appointments").refresh();
						},
						error: function (oError) {
							oStateModel.setProperty("/busy", false);
							Log.error("Error creating task: " + JSON.stringify(oError));
						}
					});
				});
			} else { // "move" appointment; only possible if task hadn't started yet
				oModel.setProperty("plannedStart", oStartDate, oAppBindingContext);
				oModel.setProperty("plannedEnd", oEndDate, oAppBindingContext);
				oModel.setProperty("estimatedEnd", oEndDate, oAppBindingContext);
				oModel.setProperty("location_ID", sLocationID, oAppBindingContext);

				oModel.submitChanges({
					success: function () {
						oStateModel.setProperty("/busy", false);
						oCalendarRow.getBinding("appointments").refresh();
					},
					error: function (oError) {
						oStateModel.setProperty("/busy", false);
						Log.error("Error moving task: " + JSON.stringify(oError));
					}
				});
			}
		},

		handleAppointmentResize: function (oEvent) { // changes the productivity factor
			var oAppointment = oEvent.getParameter("appointment"),
				oStartDate = oEvent.getParameter("startDate"),
				oEndDate = oEvent.getParameter("endDate"),
				oBC = oAppointment.getBindingContext(),
				oModel = this.getView().getModel(),
				oTask = oModel.getObject(oBC.getPath(), {
					select: "*"
				}),
				// calculate based on net duration
				iMilliSecondsPerHour = 1000 * 60 * 60,
				iNewDurationHrs = (oEndDate.getTime() - oStartDate.getTime()) / iMilliSecondsPerHour,
				mNewProductivityFactor,
				oStateModel = this.getModel("stateModel"),
				oShift = this.getShiftFromID(oTask.shift_ID),
				sLocationID = oAppointment.getParent().getBindingContext().getProperty("ID"),
				aExistingTasks = this.getTasksOfRow(sLocationID, oTask.ID),
				that = this;

			if (oTask.status < 4) {
				mNewProductivityFactor = oTask.quantity / oTask.plannedProductivity / iNewDurationHrs;
				oTask.productivityFactor = parseFloat(mNewProductivityFactor).toFixed(3);
				oTask.plannedEnd = this.getEndDateInWorkingHours(oTask.plannedStart, oTask.quantity, oTask.plannedProductivity *
					mNewProductivityFactor, oShift);
				oTask.estimatedEnd = oTask.plannedEnd;
				oTask.currentProductivity = oTask.plannedProductivity * oTask.productivityFactor;
				oTask.currentProductivity = oTask.currentProductivity.toFixed(3);
				oModel.setProperty("plannedEnd", oTask.plannedEnd, oBC);
				oModel.setProperty("estimatedEnd", oTask.plannedEnd, oBC);
				oModel.setProperty("productivityFactor", oTask.productivityFactor, oBC);
				oModel.setProperty("currentProductivity", oTask.currentProductivity, oBC);
				oStateModel.setProperty("/busy", true);
				oModel.submitChanges({
					success: function (oData) {
						oStateModel.setProperty("/busy", false);
						that.checkCollisionWithExistingTasks(aExistingTasks, oTask);
					},
					error: function (oError) {
						oStateModel.setProperty("/busy", false);
					}
				});
			} else {
				MessageBox.error(this.getResourceBundle().getText("noResizeAfterCompletedError"));
				return;
			}
		},
		/*
				isAppointmentOverlap: function (oEvent, oCalendarRow) {
					var oAppointment = oEvent.getParameter("appointment"),
						oStartDate = oEvent.getParameter("startDate"),
						oEndDate = oEvent.getParameter("endDate"),
						bAppointmentOverlapped;

					bAppointmentOverlapped = oCalendarRow.getAppointments().some(function (oCurrentAppointment) {
						if (oCurrentAppointment === oAppointment) {
							return;
						}

						var oAppStartTime = oCurrentAppointment.getStartDate().getTime(),
							oAppEndTime = oCurrentAppointment.getEndDate().getTime();

						if (oAppStartTime <= oStartDate.getTime() && oStartDate.getTime() < oAppEndTime) {
							return true;
						}

						if (oAppStartTime < oEndDate.getTime() && oEndDate.getTime() <= oAppEndTime) {
							return true;
						}

						if (oStartDate.getTime() <= oAppStartTime && oAppStartTime < oEndDate.getTime()) {
							return true;
						}
					});
					return bAppointmentOverlapped;
				},
		*/
		handleAppointmentSelect: function (oEvent) {
			var oTask = oEvent.getParameter("appointment"),
				sObjectID = oTask.getBindingContext().getObject().ID,
				oRow = oTask.getParent(),
				aSelectedTaskIDs = this.getModel("appView").getProperty("/selectedTaskIDs"),
				aSelectedTaskControlIDs = this.getModel("appView").getProperty("/selectedTaskControlIDs");

			// just to make sure no selections were left in the appView model
			if (this.byId("planningBoard").getSelectedAppointments().length === 1) { // first selection
				aSelectedTaskIDs = [];
				aSelectedTaskControlIDs = [];
			}
			// add the newly selected task to appView model
			aSelectedTaskIDs.push(sObjectID);
			aSelectedTaskControlIDs.push(oTask.getId()); // used to save the sequence of selection
			this.getModel("appView").setProperty("/selectedTaskIDs", aSelectedTaskIDs);
			this.getModel("appView").setProperty("/selectedTaskControlIDs", aSelectedTaskControlIDs);
			this._setModelsBasedOnSelections(oRow, oTask.getEndDate(), oTask.getStartDate());
			// if the Task view is open and no multiselect, display each selected task
			if (this.byId("planningBoard").getSelectedAppointments().length === 1 && this.getModel("appView").getProperty("/mode") === "Edit") {
				this.getModel("stateModel").setProperty("/selectedTaskID", sObjectID);
				this.getRouter().navTo("Task", {
					ID: sObjectID
				}, false);
			}
			if (this.byId("planningBoard").getSelectedAppointments().length === 1 && this.getModel("appView").getProperty("/mode") === "Assign") {
				this.getModel("stateModel").setProperty("/selectedTaskID", sObjectID);
				this.getRouter().navTo("WorkForce", {
					ID: sObjectID
				}, false);
			}
		},

		handleIntervalSelect: function (oEvent) {
			var oStartDate = oEvent.getParameter("startDate"),
				//oEndDate = oEvent.getParameter("endDate"),
				oRow = oEvent.getParameter("row");
			if (oRow) { // a row was selected
				// remove task selections
				var aRows = this.byId("planningBoard").getRows(),
					aTasks;
				for (var i = 0; i < aRows.length; i++) {
					aTasks = aRows[i].getAppointments();
					for (var j = 0; j < aTasks.length; j++) {
						aTasks[j].setSelected(false);
					}
				}
				this.getModel("stateModel").setProperty("/selectedTaskID", "");
				this.getModel("appView").setProperty("/selectedTaskIDs", []);
				this.getModel("appView").setProperty("/selectedTaskControlIDs", []);
				this._setModelsBasedOnSelections(oRow, oStartDate, oStartDate);
			} else { // column header was selected
				this.byId("planningBoard").setStartDate(oStartDate);
			}
		},

		onOpenBIM: function () {
			var bReplace = !Device.system.phone;
			this.getModel("appView").setProperty("/layout", "ThreeColumnsEndExpanded");
			this.getModel("appView").setProperty("/mode", "BIM");
			this.getRouter().navTo("BIM", bReplace);
		},

		//////////////////// Filter Tasks ///////////////////////

		onOpenViewSettings: function (oEvent) {
			if (!this._oViewSettingsDialog) {
				Fragment.load({
					name: "cockpit.Cockpit.view.ViewSettingsDialog",
					controller: this
				}).then(function (oDialog) {
					this._oViewSettingsDialog = oDialog;
					this._oViewSettingsDialog.setModel(this.getModel());
					this.getView().addDependent(this._oViewSettingsDialog);
					this._setFilterValues();
					this._oViewSettingsDialog.open();
					// filter crew, worker list manually (because of project_ID)
					var sProjectID = this.getModel("appView").getProperty("/selectedProjectID"),
						oCrewsList = this._oViewSettingsDialog.getFilterItems()[4].getCustomControl(),
						oWorkersList = this._oViewSettingsDialog.getFilterItems()[5].getCustomControl(),
						oForemanList = this._oViewSettingsDialog.getFilterItems()[6].getCustomControl(),
						sProfession = this.getResourceBundle().getText("filterForemanLabel"),
						oModel = this.getModel();
					oCrewsList.setModel(oModel); // revisit: oModel should be set. it's a bug that will be resolved soon 8/5/20
					oWorkersList.setModel(oModel);
					oForemanList.setModel(oModel);
					oCrewsList.getBinding("items").filter(new Filter("project_ID", sap.ui.model.FilterOperator.EQ, sProjectID));
					oWorkersList.getBinding("items").filter(new Filter("deployment/project_ID", sap.ui.model.FilterOperator.EQ, sProjectID));
					oForemanList.getBinding("items").filter(new Filter({
						filters: [
							new Filter("profession/description", sap.ui.model.FilterOperator.EQ, sProfession),
							new Filter("deployment/project_ID", sap.ui.model.FilterOperator.EQ, sProjectID)
						],
						and: true
					}));
				}.bind(this));
			} else {
				this._oViewSettingsDialog.open();
			}
		},

		_setFilterValues: function () {
			// set the values of the viewSettingsDialog from the _oTaskFilterState
			var oStatusFilter = this._oViewSettingsDialog.getFilterItems()[0].getCustomControl(),
				oProductivityRangeFilter = this._oViewSettingsDialog.getFilterItems()[1].getCustomControl(),
				oDisciplineFilter = this._oViewSettingsDialog.getFilterItems()[2].getCustomControl(),
				oCompanyFilter = this._oViewSettingsDialog.getFilterItems()[3].getCustomControl(),
				oCrewFilter = this._oViewSettingsDialog.getFilterItems()[4].getCustomControl(),
				oWorkerFilter = this._oViewSettingsDialog.getFilterItems()[5].getCustomControl(),
				oForemanFilter = this._oViewSettingsDialog.getFilterItems()[6].getCustomControl(),
				aRange = [Number(this._oTaskFilterState.aProductivityRange[0]), Number(this._oTaskFilterState.aProductivityRange[1])],
				aSelectedDisciplineKeys = [],
				aSelectedCompanyKeys = [],
				aSelectedCrewKeys = [],
				aSelectedWorkerKeys = [],
				aSelectedForemanKeys = [];

			for (var i = 0; i < this._oTaskFilterState.aDisciplineFilter.length; i++) {
				aSelectedDisciplineKeys.push(this._oTaskFilterState.aDisciplineFilter[i].oValue1);
			}
			for (i = 0; i < this._oTaskFilterState.aCompanyFilter.length; i++) {
				aSelectedCompanyKeys.push(this._oTaskFilterState.aCompanyFilter[i].oValue1);
			}
			for (i = 0; i < this._oTaskFilterState.aCrewFilter.length; i++) {
				aSelectedCrewKeys.push(this._oTaskFilterState.aCrewFilter[i].oValue1);
			}
			for (i = 0; i < this._oTaskFilterState.aWorkerFilter.length; i++) {
				aSelectedWorkerKeys.push(this._oTaskFilterState.aWorkerFilter[i].oValue1);
			}
			for (i = 0; i < this._oTaskFilterState.aForemanFilter.length; i++) {
				aSelectedForemanKeys.push(this._oTaskFilterState.aForemanFilter[i].oValue1);
			}

			oStatusFilter.setSelectedIndex(this._oTaskFilterState.iStatus);
			if (this._oTaskFilterState.iStatus === -1) {
				this._oViewSettingsDialog.getFilterItems()[0].setFilterCount(0);
				this._oViewSettingsDialog.getFilterItems()[0].setSelected(false);
			} else {
				this._oViewSettingsDialog.getFilterItems()[0].setFilterCount(1);
				this._oViewSettingsDialog.getFilterItems()[0].setSelected(true);
			}
			oProductivityRangeFilter.setRange(aRange);
			if (aRange[0] === 0 && aRange[1] === 200) {
				this._oViewSettingsDialog.getFilterItems()[1].setFilterCount(0);
				this._oViewSettingsDialog.getFilterItems()[1].setSelected(false);
			} else {
				this._oViewSettingsDialog.getFilterItems()[1].setFilterCount(1);
				this._oViewSettingsDialog.getFilterItems()[1].setSelected(true);
			}
			if (aSelectedDisciplineKeys.length > 0) {
				oDisciplineFilter.setSelectedKeys(aSelectedDisciplineKeys);
				this._oViewSettingsDialog.getFilterItems()[2].setFilterCount(aSelectedDisciplineKeys.length);
				this._oViewSettingsDialog.getFilterItems()[2].setSelected(true);
			} else {
				oDisciplineFilter.setSelectedKeys(); // passing an empty array doesn't deselect
				this._oViewSettingsDialog.getFilterItems()[2].setFilterCount(0);
				this._oViewSettingsDialog.getFilterItems()[2].setSelected(false);
			}
			if (aSelectedCompanyKeys.length > 0) {
				oCompanyFilter.setSelectedKeys(aSelectedCompanyKeys);
				this._oViewSettingsDialog.getFilterItems()[3].setFilterCount(aSelectedCompanyKeys.length);
				this._oViewSettingsDialog.getFilterItems()[3].setSelected(true);
			} else {
				oCompanyFilter.setSelectedKeys();
				this._oViewSettingsDialog.getFilterItems()[3].setFilterCount(0);
				this._oViewSettingsDialog.getFilterItems()[3].setSelected(false);
			}
			if (aSelectedCrewKeys.length > 0) {
				oCrewFilter.setSelectedKeys(aSelectedCrewKeys);
				this._oViewSettingsDialog.getFilterItems()[4].setFilterCount(aSelectedCrewKeys.length);
				this._oViewSettingsDialog.getFilterItems()[4].setSelected(true);
			} else {
				oCrewFilter.setSelectedKeys();
				this._oViewSettingsDialog.getFilterItems()[4].setFilterCount(0);
				this._oViewSettingsDialog.getFilterItems()[4].setSelected(false);
			}
			if (aSelectedWorkerKeys.length > 0) {
				oWorkerFilter.setSelectedKeys(aSelectedWorkerKeys);
				this._oViewSettingsDialog.getFilterItems()[5].setFilterCount(aSelectedWorkerKeys.length);
				this._oViewSettingsDialog.getFilterItems()[5].setSelected(true);
			} else {
				oWorkerFilter.setSelectedKeys();
				this._oViewSettingsDialog.getFilterItems()[5].setFilterCount(0);
				this._oViewSettingsDialog.getFilterItems()[5].setSelected(false);
			}
			if (aSelectedForemanKeys.length > 0) {
				oForemanFilter.setSelectedKeys(aSelectedForemanKeys);
				this._oViewSettingsDialog.getFilterItems()[6].setFilterCount(aSelectedForemanKeys.length);
				this._oViewSettingsDialog.getFilterItems()[6].setSelected(true);
			} else {
				oForemanFilter.setSelectedKeys();
				this._oViewSettingsDialog.getFilterItems()[6].setFilterCount(0);
				this._oViewSettingsDialog.getFilterItems()[6].setSelected(false);
			}
		},

		_createTaskFilterFromCrewsForTask: function (aSelectedCrewKeys) {
			var oModel = this.getModel(),
				aCrewsForTaskFilters = [],
				sProjectID = this.getModel("appView").getProperty("/selectedProjectID"),
				sProjectFilter = new Filter("project_ID", sap.ui.model.FilterOperator.EQ, sProjectID),
				oCombiFilter = [],
				aCrewFilters = [];

			// build a filter for all selected crews
			for (var i = 0; i < aSelectedCrewKeys.length; i++) {
				aCrewsForTaskFilters.push(new Filter({
					path: "crew_ID",
					operator: sap.ui.model.FilterOperator.EQ,
					value1: aSelectedCrewKeys[i]
				}));
			}
			// search only for the current project
			oCombiFilter.push(new Filter({
				filters: aCrewsForTaskFilters.concat(sProjectFilter),
				and: true
			}));
			return new Promise(function (resolve, reject) {
				if (aSelectedCrewKeys.length === 0) {
					resolve(aCrewFilters);
				} else {
					oModel.read("/CrewsForTask", {
						filters: oCombiFilter,
						success: function (oData) {
							for (var j = 0; j < oData.results.length; j++) {
								// "hand pick" Tasks by ID
								aCrewFilters.push(new Filter({
									path: "ID",
									operator: sap.ui.model.FilterOperator.EQ,
									value1: oData.results[j].task_ID
								}));
							}
							resolve(aCrewFilters);
						},
						error: function (oError) {
							reject(aCrewFilters);
						}
					});
				}
			});
		},

		_getCrewIDsFromWorkers: function (aSelectedWorkerKeys) {
			var oModel = this.getModel(),
				aWorkerIDs = aSelectedWorkerKeys,
				aCrewIDs = [];

			return new Promise(function (resolve, reject) {
				if (aSelectedWorkerKeys.length === 0) {
					resolve([aCrewIDs, aWorkerIDs]);
				} else {
					aSelectedWorkerKeys.reduce(function (t, sWorkerID, i) {
						var aWorkerFilter = [new Filter("ID", sap.ui.model.FilterOperator.EQ, sWorkerID)];
						new Promise(function () {
							oModel.read("/Persons", {
								filters: aWorkerFilter,
								success: function (oWorker) {
									if (oWorker.results[0].memberOfCrew_ID) { // worker is member of a crew
										// add to the crew IDs 
										// could already be included if multiple workers are selected and they are in the same crew
										if (!aCrewIDs.includes(oWorker.results[0].memberOfCrew_ID)) {
											aCrewIDs.push(oWorker.results[0].memberOfCrew_ID);
										}
										// remove from the worker IDs
										aWorkerIDs = aWorkerIDs.filter(function (sID) {
											return sID !== sWorkerID;
										});
									}
									resolve([aCrewIDs, aWorkerIDs]);
								},
								error: function (oError) {
									resolve();
								}
							});
						});
					}, Promise.resolve([aCrewIDs, aWorkerIDs]));
				}
			});
		},

		_createTaskFilterFromWorkersForTask: function (aSelectedWorkerKeys) {
			var oModel = this.getModel(),
				aWorkersForTaskFilters = [],
				sProjectID = this.getModel("appView").getProperty("/selectedProjectID"),
				sProjectFilter = new Filter("project_ID", sap.ui.model.FilterOperator.EQ, sProjectID),
				oCombiFilter = [],
				aWorkerFilters = [];

			// build a filter for all selected workers
			for (var i = 0; i < aSelectedWorkerKeys.length; i++) {
				aWorkersForTaskFilters.push(new Filter({
					path: "worker_ID",
					operator: sap.ui.model.FilterOperator.EQ,
					value1: aSelectedWorkerKeys[i]
				}));
			}
			// search only for the current project
			oCombiFilter.push(new Filter({
				filters: aWorkersForTaskFilters.concat(sProjectFilter),
				and: true
			}));
			return new Promise(function (resolve, reject) {
				if (aWorkersForTaskFilters.length === 0) {
					resolve(aWorkerFilters);
				} else {
					oModel.read("/WorkersForTask", {
						filters: oCombiFilter,
						success: function (oData) {
							for (var j = 0; j < oData.results.length; j++) {
								// "hand pick" Tasks by ID
								aWorkerFilters.push(new Filter({
									path: "ID",
									operator: sap.ui.model.FilterOperator.EQ,
									value1: oData.results[j].task_ID
								}));
							}
							resolve(aWorkerFilters);
						},
						error: function (oError) {
							reject(aWorkerFilters);
						}
					});
				}
			});
		},

		_saveTaskFilterState: function (oFilters) {
			this._oTaskFilterState.iStatus = oFilters.status;
			this._oTaskFilterState.aProductivityRange = oFilters.productivityRange;
			this._oTaskFilterState.aDisciplineFilter = oFilters.disciplineFilters;
			this._oTaskFilterState.aCompanyFilter = oFilters.companyFilters;
			this._oTaskFilterState.aCrewFilter = oFilters.crewFilters;
			this._oTaskFilterState.aWorkerFilter = oFilters.workerFilters;
			this._oTaskFilterState.aForemanFilter = oFilters.foremanFilters;
		},

		onConfirmViewSettingsDialog: function () {
			var oStatusFilter = this._oViewSettingsDialog.getFilterItems()[0].getCustomControl(),
				iSelectedStatusIndex = oStatusFilter.getSelectedIndex() - 1, // 0 = any status, 1 = planned
				oProductivityRangeFilter = this._oViewSettingsDialog.getFilterItems()[1].getCustomControl(),
				aSelectedDisciplineKeys = this._oViewSettingsDialog.getFilterItems()[2].getCustomControl().getSelectedKeys(),
				aDisciplineFilters = [],
				aSelectedCompanyKeys = this._oViewSettingsDialog.getFilterItems()[3].getCustomControl().getSelectedKeys(),
				aCompanyFilters = [],
				aSelectedCrewKeys = this._oViewSettingsDialog.getFilterItems()[4].getCustomControl().getSelectedKeys() || [],
				aSelectedWorkerKeys = this._oViewSettingsDialog.getFilterItems()[5].getCustomControl().getSelectedKeys() || [],
				aSelectedForemanKeys = this._oViewSettingsDialog.getFilterItems()[6].getCustomControl().getSelectedKeys() || [],
				aForemanFilters = [],
				that = this;

			// build all filters and store them in this._oTaskFilterState
			if (aSelectedDisciplineKeys && aSelectedDisciplineKeys.length > 0) {
				for (var i = 0; i < aSelectedDisciplineKeys.length; i++) {
					aDisciplineFilters.push(new Filter({
						path: "discipline_ID",
						operator: sap.ui.model.FilterOperator.EQ,
						value1: aSelectedDisciplineKeys[i]
					}));
				}
			}
			if (aSelectedCompanyKeys && aSelectedCompanyKeys.length > 0) {
				for (i = 0; i < aSelectedCompanyKeys.length; i++) {
					aCompanyFilters.push(new Filter({
						path: "companies/company_ID",
						operator: sap.ui.model.FilterOperator.EQ,
						value1: aSelectedCompanyKeys[i]
					}));
				}
			}
			if (aSelectedForemanKeys && aSelectedForemanKeys.length > 0) {
				for (i = 0; i < aSelectedForemanKeys.length; i++) {
					aForemanFilters.push(new Filter({
						path: "supervisor_ID",
						operator: sap.ui.model.FilterOperator.EQ,
						value1: aSelectedForemanKeys[i]
					}));
				}
			}
			this.getModel("stateModel").setProperty("/busy", true);
			// check if worker is a crew member: returns an array of crew IDs and an adjusted array of worker IDs
			this._getCrewIDsFromWorkers(aSelectedWorkerKeys).then(function (aCrewWorkerIDs) {
				// first is array of crewIDs, second array of worker IDs
				aSelectedCrewKeys = aSelectedCrewKeys.concat(aCrewWorkerIDs[0]);
				aSelectedWorkerKeys = aCrewWorkerIDs[1]; // this is the new array of worker IDs (those in a crew are removed)
				// as filtering by 1:many associations is not supported arrays of task filters are returned
				that._createTaskFilterFromWorkersForTask(aSelectedWorkerKeys).then(function (aWorkerFilters) {
					that._createTaskFilterFromCrewsForTask(aSelectedCrewKeys).then(function (aCrewFilters) {
						var bClearEnabled = false,
							oFilters = {
								status: iSelectedStatusIndex,
								productivityRange: [String(oProductivityRangeFilter.getRange()[0]), String(oProductivityRangeFilter.getRange()[1])],
								disciplineFilters: aDisciplineFilters,
								companyFilters: aCompanyFilters,
								crewFilters: aCrewFilters,
								workerFilters: aWorkerFilters,
								foremanFilters: aForemanFilters
							};
						that._saveTaskFilterState(oFilters); // separate function as "this._" is not available here
						bClearEnabled = oFilters.status >= 0;
						bClearEnabled = bClearEnabled || oFilters.productivityRange[0] !== "0";
						bClearEnabled = bClearEnabled || oFilters.productivityRange[1] !== "200";
						bClearEnabled = bClearEnabled || oFilters.disciplineFilters.length !== 0;
						bClearEnabled = bClearEnabled || oFilters.companyFilters.length !== 0;
						bClearEnabled = bClearEnabled || oFilters.crewFilters.length !== 0;
						bClearEnabled = bClearEnabled || oFilters.workerFilters.length !== 0;
						bClearEnabled = bClearEnabled || oFilters.foremanFilters.length !== 0;
						that.byId("clearFiltersButton").setEnabled(bClearEnabled);
						that._applyTaskFilters();
						that.getModel("stateModel").setProperty("/busy", false);
					});
				});
			});
		},

		handleDisciplineSelectionFinish: function (oEvent) {
			var aSeletedKeys = oEvent.getParameter("selectedItems"),
				oDisciplineFilter = this._oViewSettingsDialog.getFilterItems()[2];

			if (aSeletedKeys && aSeletedKeys.length > 0) {
				oDisciplineFilter.setFilterCount(aSeletedKeys.length);
				oDisciplineFilter.setSelected(true);
			} else {
				oDisciplineFilter.setFilterCount(0);
				oDisciplineFilter.setSelected(false);
			}
		},

		handleCompanySelectionFinish: function (oEvent) {
			var aSeletedKeys = oEvent.getParameter("selectedItems"),
				oCompanyFilter = this._oViewSettingsDialog.getFilterItems()[3];

			if (aSeletedKeys && aSeletedKeys.length > 0) {
				oCompanyFilter.setFilterCount(aSeletedKeys.length);
				oCompanyFilter.setSelected(true);
			} else {
				oCompanyFilter.setFilterCount(0);
				oCompanyFilter.setSelected(false);
			}
		},

		handleCrewSelectionFinish: function (oEvent) {
			var aSeletedKeys = oEvent.getParameter("selectedItems"),
				oCrewFilter = this._oViewSettingsDialog.getFilterItems()[4];

			if (aSeletedKeys && aSeletedKeys.length > 0) {
				oCrewFilter.setFilterCount(aSeletedKeys.length);
				oCrewFilter.setSelected(true);
			} else {
				oCrewFilter.setFilterCount(0);
				oCrewFilter.setSelected(false);
			}
		},

		handleWorkerSelectionFinish: function (oEvent) {
			var aSeletedKeys = oEvent.getParameter("selectedItems"),
				oWorkerFilter = this._oViewSettingsDialog.getFilterItems()[5];

			if (aSeletedKeys && aSeletedKeys.length > 0) {
				oWorkerFilter.setFilterCount(aSeletedKeys.length);
				oWorkerFilter.setSelected(true);
			} else {
				oWorkerFilter.setFilterCount(0);
				oWorkerFilter.setSelected(false);
			}
		},

		handleForemanSelectionFinish: function (oEvent) {
			var aSeletedKeys = oEvent.getParameter("selectedItems"),
				oForemanFilter = this._oViewSettingsDialog.getFilterItems()[6];

			if (aSeletedKeys && aSeletedKeys.length > 0) {
				oForemanFilter.setFilterCount(aSeletedKeys.length);
				oForemanFilter.setSelected(true);
			} else {
				oForemanFilter.setFilterCount(0);
				oForemanFilter.setSelected(false);
			}
		},

		handleTaskStatusChange: function (oEvent) {
			var iStatus = oEvent.getParameter("selectedIndex");
			var oStatusFilter = this._oViewSettingsDialog.getFilterItems()[0];
			if (iStatus > 0) { // 0 is any status, -1 is default
				oStatusFilter.setFilterCount(1);
				oStatusFilter.setSelected(true);
			} else {
				oStatusFilter.setFilterCount(0);
				oStatusFilter.setSelected(false);
			}
		},

		onProductivityRangeChange: function (oEvent) {
			var aRange = oEvent.getParameter("range");
			var oProductivityRangeFilter = this._oViewSettingsDialog.getFilterItems()[1];
			if (aRange[0] !== 0 || aRange[1] !== 200) {
				oProductivityRangeFilter.setFilterCount(1);
				oProductivityRangeFilter.setSelected(true);
			} else {
				oProductivityRangeFilter.setFilterCount(0);
				oProductivityRangeFilter.setSelected(false);
			}
		},

		onResetFilters: function () { // restets only the values in the viewSettingsDialog
			var aFilterItems = this._oViewSettingsDialog.getFilterItems(),
				oStatusFilter = this._oViewSettingsDialog.getFilterItems()[0].getCustomControl(),
				oProductivityRangeFilter = this._oViewSettingsDialog.getFilterItems()[1].getCustomControl(),
				oDisciplineFilter = this._oViewSettingsDialog.getFilterItems()[2].getCustomControl(),
				oCompanyFilter = this._oViewSettingsDialog.getFilterItems()[3].getCustomControl(),
				oCrewFilter = this._oViewSettingsDialog.getFilterItems()[4].getCustomControl(),
				oWorkerFilter = this._oViewSettingsDialog.getFilterItems()[5].getCustomControl(),
				oForemanFilter = this._oViewSettingsDialog.getFilterItems()[6].getCustomControl();
			for (var i = 0; i < aFilterItems.length; i++) {
				aFilterItems[i].setFilterCount(0);
				aFilterItems[i].setSelected(false);
			}
			oStatusFilter.setSelectedIndex(0);
			oProductivityRangeFilter.setRange([0, 200]);
			oDisciplineFilter.setSelectedKeys();
			oCompanyFilter.setSelectedKeys();
			oCrewFilter.setSelectedKeys();
			oWorkerFilter.setSelectedKeys();
			oForemanFilter.setSelectedKeys();
		},

		onClearFilters: function () {
			var aFilterItems = this._oViewSettingsDialog.getFilterItems();
			for (var i = 0; i < aFilterItems.length; i++) {
				aFilterItems[i].setFilterCount(0);
				aFilterItems[i].setSelected(false);
			}
			this._oTaskFilterState.iStatus = -1;
			this._oTaskFilterState.aProductivityRange = ["0", "200"];
			this._oTaskFilterState.aDisciplineFilter = [];
			this._oTaskFilterState.aCompanyFilter = [];
			this._oTaskFilterState.aCrewFilter = [];
			this._oTaskFilterState.aWorkerFilter = [];
			this._oTaskFilterState.aForemanFilter = [];
			this.byId("clearFiltersButton").setEnabled(false);
			this._setFilterValues();
			this._applyTaskFilters();
		},

		onCancelViewSettingsDialog: function () {
			this._setFilterValues(); // dialog is closed by the control
		},

		_applyTaskFilters: function () {
			var aDisciplineFilters = this._oTaskFilterState.aDisciplineFilter,
				aCompanyFilters = this._oTaskFilterState.aCompanyFilter,
				// crew and worker filters are both filters on task by ID; so combine them
				aCrewOrWorkerFilters = this._oTaskFilterState.aCrewFilter.concat(this._oTaskFilterState.aWorkerFilter),
				aForemanFilters = this._oTaskFilterState.aForemanFilter,
				aProductivityRange = this._oTaskFilterState.aProductivityRange,
				iStatus = this._oTaskFilterState.iStatus,
				oDiscFilters,
				oCompanyFilters,
				oCrewOrWorkerFilters,
				oForemanFilters,
				oProductivityRangeFilter,
				oStatusFilter,
				aArrayOfFilterArrays = [],
				oCombinedTaskFilters = [],
				oPC = this.byId("planningBoard"),
				aRows = oPC.getRows(),
				oAppBC = {};

			if (!aRows || aRows.length === 0) {
				return;
			}

			//create OR filters for each selection set
			if (aDisciplineFilters.length > 0) {
				oDiscFilters = new Filter({
					filters: aDisciplineFilters,
					and: false
				});
				aArrayOfFilterArrays.push(oDiscFilters);
			}
			if (aCompanyFilters.length > 0) {
				oCompanyFilters = new Filter({
					filters: aCompanyFilters,
					and: false
				});
				aArrayOfFilterArrays.push(oCompanyFilters);
			}
			if (aCrewOrWorkerFilters.length > 0) {
				oCrewOrWorkerFilters = new Filter({
					filters: aCrewOrWorkerFilters,
					and: false
				});
				aArrayOfFilterArrays.push(oCrewOrWorkerFilters);
			}
			if (aForemanFilters.length > 0) {
				oForemanFilters = new Filter({
					filters: aForemanFilters,
					and: false
				});
				aArrayOfFilterArrays.push(oForemanFilters);
			}
			if (aProductivityRange[0] !== "0" || aProductivityRange[1] !== "200") {
				oProductivityRangeFilter = new Filter({
					path: "KPI",
					operator: sap.ui.model.FilterOperator.BT,
					value1: Number(aProductivityRange[0]) / 100,
					value2: Number(aProductivityRange[1]) / 100
				});
				aArrayOfFilterArrays.push(oProductivityRangeFilter);
			}
			if (iStatus >= 0) {
				oStatusFilter = new Filter({
					path: "status",
					operator: sap.ui.model.FilterOperator.EQ,
					value1: iStatus
				});
				aArrayOfFilterArrays.push(oStatusFilter);
			}

			// create a combined AND filter if more than one filter set present
			if (aArrayOfFilterArrays.length > 1) {
				// filter undefined filters array
				oCombinedTaskFilters = new Filter({
					filters: aArrayOfFilterArrays,
					and: true
				});
			} else { // only one filter set
				oCombinedTaskFilters = aArrayOfFilterArrays;
			}

			// apply filter for each row
			for (var i = 0; i < aRows.length; i++) {
				oAppBC = aRows[i].getBinding("appointments");
				oAppBC.filter(oCombinedTaskFilters, "Application");
			}
		},

		///////////////////////////////////// MENU FUNCTIONS /////////////////////////////////////

		onMainMenu: function (oEvent) {
			oEvent.preventDefault();
			if (!this._menu) {
				this._menu = sap.ui.xmlfragment(
					"cockpit.Cockpit.view.MainMenu",
					this
				);
				this.getView().addDependent(this._menu);
			}
			this._enableMenuItems();
			var eDock = sap.ui.core.Popup.Dock,
				oButton = oEvent.getSource();
			this._menu.open(this._bKeyboard, oButton, eDock.BeginTop, eDock.BeginBottom, oButton);
		},

		onAddTask: function () {
			var bReplace = !Device.system.phone;
			this.getModel("appView").setProperty("/layout", "ThreeColumnsEndExpanded");
			this.getModel("appView").setProperty("/mode", "Create");
			this.getRouter().navTo("Recipes", bReplace);
		},

		editTask: function () {
			var oStateModel = this.getModel("stateModel"),
				sID = oStateModel.getProperty("/selectedTaskID"),
				bReplace = !Device.system.phone;
			this.getModel("appView").setProperty("/layout", "ThreeColumnsEndExpanded");
			this.getModel("appView").setProperty("/mode", "Edit");

			this.getRouter().navTo("Task", {
				ID: sID
			}, bReplace);
		},

		handleTaskDelete: function () {
			var aSelectedAppointments = this.byId("planningBoard").getSelectedAppointments(),
				sConfirmTitle = "",
				sConfirmText = "",
				oModel = this.getModel(),
				oStateModel = this.getModel("stateModel"),
				sTaskPath,
				sID,
				sLayout = this.getModel("appView").getProperty("/layout"),
				that = this;
			if (aSelectedAppointments && aSelectedAppointments.length > 0) {
				sConfirmTitle = this.getResourceBundle().getText("taskDeleteConfirmTitle");
				if (aSelectedAppointments.length > 1) {
					var sConfirmText1 = this.getResourceBundle().getText("taskDeleteConfirmText1"),
						sConfirmText2 = this.getResourceBundle().getText("taskDeleteConfirmText2Multiple");
					sConfirmText = sConfirmText1 + " " + aSelectedAppointments.length + " " + sConfirmText2;
				} else {
					sConfirmText = this.getResourceBundle().getText("taskDeleteConfirmText1") + " " + this.getResourceBundle().getText(
						"taskDeleteConfirmText2");
				}
				MessageBox.confirm(
					sConfirmText, {
						icon: MessageBox.Icon.WARNING,
						title: sConfirmTitle,
						actions: [sap.m.MessageBox.Action.OK, sap.m.MessageBox.Action.CANCEL],
						initialFocus: MessageBox.Action.CANCEL,
						onClose: function (sAction) {
							if (sAction === "OK") {
								// if one task is displayed in the Task view, close it
								if (aSelectedAppointments.length === 1 && (sLayout === "ThreeColumnsMidExpanded" || sLayout === "ThreeColumnsEndExpanded")) {
									that.getModel("appView").setProperty("/layout", "TwoColumnsMidExpanded");
								}
								for (var i = 0; i < aSelectedAppointments.length; i++) {
									// that.byId is no longer working as appointments can't have stable IDs
									sID = sap.ui.getCore().byId(aSelectedAppointments[i]).getBindingContext().getObject().ID;
									sTaskPath = "/" + oModel.createKey("Tasks", {
										ID: sID
									});
									oStateModel.setProperty("/busy", true);
									oModel.remove(sTaskPath, {
										success: function (oData) {
											oStateModel.setProperty("/busy", false);
										},
										error: function (oError) {
											oStateModel.setProperty("/busy", false);
										}
									});
								}
								that.getView().rerender();
								that._clearModelsOfSelections();
								that.getModel("appView").setProperty("/activeRowID", "");
								that.getModel("appView").setProperty("/activeStartDate", new Date());
								that.getModel("appView").setProperty("/activeEndDate", new Date());
							}
						}
					}
				);
			}
		},

		nextStatus: function () {
			var oPC = this.byId("planningBoard"),
				aSelectedTaskIDs = oPC.getSelectedAppointments(),
				oTask = {},
				aSelectedTasks = [],
				oShift,
				iStatus,
				sConfirmTitle = this.getResourceBundle().getText("confirmStatusChangeTitle"),
				sConfirmText = "",
				sTaskPath,
				oModel = this.getModel(),
				oStateModel = this.getModel("stateModel"),
				oPreviousTask,
				sAlertMsg,
				bAbort,
				that = this;

			for (var i = 0; i < aSelectedTaskIDs.length; i++) {
				//oTask = this.byId(aSelectedTaskIDs[i]); // not working
				oTask = sap.ui.getCore().byId(aSelectedTaskIDs[i]);
				aSelectedTasks.push(oTask);
			}
			oTask = aSelectedTasks[0].getBindingContext().getObject({
				select: "status"
			});
			iStatus = oTask.status; // all selected tasks have the same status
			switch (iStatus) {
			case 0:
				sConfirmText = this.getResourceBundle().getText("statusCommitted");
				break;
			case 1:
				sConfirmText = this.getResourceBundle().getText("statusStarted");
				break;
			case 2:
				sConfirmText = this.getResourceBundle().getText("statusCompleted");
				break;
			case 3:
				sConfirmText = this.getResourceBundle().getText("statusCompleted"); //started and stopped will be moved to completed
				break;
			case 4:
				sConfirmText = this.getResourceBundle().getText("statusApproved");
				break;
			}
			if (iStatus === 2) {
				iStatus = 4; // jump over "stopped"
			} else {
				iStatus += 1;
			}
			// check if it can be started outside of the confirm msg callback
			if (iStatus === 2) {
				for (i = 0; i < aSelectedTasks.length; i++) {
					oPreviousTask = this.getPreviousTask(aSelectedTasks[i]);
					// if the previous task is not yet completed then abort
					if (oPreviousTask && oPreviousTask.getBindingContext().getProperty("status") < 4) {
						sAlertMsg = that.getResourceBundle().getText("alertPreviousTaskNotCompleted", [oPreviousTask.getTitle()]);
						bAbort = true;
						sap.m.MessageBox.alert(sAlertMsg, {
							onClose: function () {
								that._clearModelsOfSelections();
								return;
							}
						});
					}
				}
			}
			if (bAbort) return;
			sConfirmTitle = this.getResourceBundle().getText("confirmStatusChangeTitle");
			sConfirmText = this.getResourceBundle().getText("confirmStatusChangeText") + " " + sConfirmText + "?";
			MessageBox.confirm(
				sConfirmText, {
					icon: MessageBox.Icon.WARNING,
					title: sConfirmTitle,
					actions: [sap.m.MessageBox.Action.YES, sap.m.MessageBox.Action.NO],
					initialFocus: MessageBox.Action.CANCEL,
					onClose: function (sAction) {
						if (sAction === "YES") {
							for (var j = 0; j < aSelectedTasks.length; j++) {
								sTaskPath = "/" + oModel.createKey("Tasks", {
									ID: aSelectedTasks[j].getBindingContext().getObject().ID
								});
								oTask = aSelectedTasks[j].getBindingContext().getObject({
									select: "*"
								});
								oShift = that.getShiftFromID(oTask.shift_ID);
								oTask.status = iStatus;
								// actions on new status
								if (oTask.status === 2) { // started for the first time
									oTask.actualStart = that.getStartDateInWorkingHours(new Date(), oShift);
									oTask.estimatedEnd = that.getEndDateInWorkingHours(oTask.actualStart, oTask.quantity, oTask.plannedProductivity * oTask.productivityFactor,
										oShift);
								} else if (oTask.status === 4) { // completed; no shift to working hours
									oTask.estimatedEnd = new Date();
									if (!that.inShift(oTask.estimatedEnd, oShift)) {
										oTask.estimatedEnd = that.getPreviousShiftEnd(oTask.estimatedEnd, oShift);
									}
									// checkAutoCompleteMeasurements creates final measurement, saves results to recipe and updates oTask
									that.checkAutoCompleteMeasurements(oTask);
									//that.createWorkerTimeSheets(oTask);
									that._clearModelsOfSelections();
									return;
								} else if (oTask.status === 5) { // approved; no shift to working hours
									oTask.actualEnd = new Date();
								}
								oStateModel.setProperty("/busy", true);
								oModel.update(sTaskPath, oTask, {
									success: function (oData) {
										oStateModel.setProperty("/busy", false);
									},
									error: function (oError) {
										oStateModel.setProperty("/busy", false);
									}
								});
							}
							that._clearModelsOfSelections();
						}
					}
				}
			);
		},

		toNextShiftStart: function () {
			var oPC = this.byId("planningBoard"),
				aSelectedTaskIDs = oPC.getSelectedAppointments(),
				oModel = this.getModel(),
				oViewModel = this.getModel("stateModel"),
				oShift = {},
				oBC,
				iStatus,
				oPlannedStart,
				oPlannedEnd,
				sErrorText = this.getResourceBundle().getText("errorStartedTaskMove");

			var oTask = {},
				sPath;

			// reject all if one is already started
			for (var i = 0; i < aSelectedTaskIDs.length; i++) {
				//iStatus = this.byId(aSelectedTaskIDs[i]).getBindingContext().getProperty("status"); // not working
				iStatus = sap.ui.getCore().byId(aSelectedTaskIDs[i]).getBindingContext().getProperty("status");
				if (iStatus > 1) {
					MessageBox.error(sErrorText);
					return;
				}
			}
			for (i = 0; i < aSelectedTaskIDs.length; i++) {
				//oBC = this.byId(aSelectedTaskIDs[i]).getBindingContext(); // not working
				oBC = sap.ui.getCore().byId(aSelectedTaskIDs[i]).getBindingContext();
				oShift = this.getShiftFromID(oBC.getProperty("shift_ID"));
				oPlannedStart = this.getNextShiftStart(oBC.getProperty("plannedStart"), oShift);
				oPlannedEnd = this.getEndDateInWorkingHours(oPlannedStart, oBC.getProperty("quantity"), oBC.getProperty("plannedProductivity"),
					oShift);
				oTask = oBC.getObject({
					select: "*"
				});
				oTask.plannedStart = oPlannedStart;
				oTask.plannedEnd = oPlannedEnd;
				oTask.estimatedEnd = oPlannedEnd;
				sPath = "/" + oModel.createKey("Tasks", {
					ID: oTask.ID
				});
				oModel.update(sPath, oTask, {
					success: function (oData) {
						oViewModel.setProperty("/busy", false);
					},
					error: function (oError) {
						oViewModel.setProperty("/busy", false);
					}
				});
			}
			oViewModel.setProperty("/busy", true);
			this._clearModelsOfSelections();
		},

		onMoveBy: function (oEvent) {
			var oPC = this.byId("planningBoard"),
				aSelectedTaskIDs = oPC.getSelectedAppointments(),
				sHoursMinutes = oEvent.getParameter("item").getValue(),
				iSeparatorIndex = sHoursMinutes.indexOf(":"),
				sHours,
				sMinutes,
				iStatus;

			if (iSeparatorIndex < 0) { // interpret as minutes only
				sMinutes = sHoursMinutes;
				sHours = 0;
			} else {
				sHours = sHoursMinutes.slice(0, iSeparatorIndex);
				sMinutes = sHoursMinutes.slice(iSeparatorIndex + 1);
			}
			if (isNaN(parseInt(sHours, 10)) || isNaN(parseInt(sMinutes, 10))) {
				MessageBox.error(this.getResourceBundle().getText("notValidTime"));
				return;
			}
			if (parseInt(sMinutes, 10) < 0 || parseInt(sMinutes, 10) > 59) {
				MessageBox.error(this.getResourceBundle().getText("incorrectHrsMinsErrorText"));
				return;
			}
			// reject all if one is already started
			for (var i = 0; i < aSelectedTaskIDs.length; i++) {
				//iStatus = this.byId(aSelectedTaskIDs[i]).getBindingContext().getProperty("status"); // not working
				iStatus = sap.ui.getCore().byId(aSelectedTaskIDs[i]).getBindingContext().getProperty("status");
				if (iStatus > 1) {
					MessageBox.error(this.getResourceBundle().getText("errorStartedTaskMove"));
					return;
				}
			}
			var mTimeShift = parseInt(sHours, 10) + parseInt(sMinutes, 10) / 60,
				oModel = this.getModel(),
				oViewModel = this.getModel("stateModel"),
				oBC,
				oShift,
				oPlannedStart,
				oPlannedEnd,
				bWarningDone = false;

			for (i = 0; i < aSelectedTaskIDs.length; i++) {
				oBC = sap.ui.getCore().byId(aSelectedTaskIDs[i]).getBindingContext();
				oShift = this.getShiftFromID(oBC.getProperty("shift_ID"));
				if (mTimeShift > 0) {
					oPlannedStart = new Date(this.getFutureDateInWorkingHours(oBC.getProperty("plannedStart"), mTimeShift, oShift));
					oPlannedEnd = this.getEndDateInWorkingHours(oPlannedStart, oBC.getProperty("quantity"),
						oBC.getProperty("plannedProductivity"), oShift);
				} else { // follow pull principle - use end date as a starting point
					// mTimeShift must be positive
					oPlannedEnd = new Date(this.getPastDateInWorkingHours(oBC.getProperty("estimatedEnd"), Math.abs(mTimeShift), oShift));
					oPlannedStart = this.getPullStartDateInWorkingHours(oPlannedEnd, oBC.getProperty("quantity"),
						oBC.getProperty("plannedProductivity"), oShift);
					// warn once if tasks are in the past
					if (oPlannedStart < new Date() && !bWarningDone) {
						bWarningDone = true;
						MessageBox.warning(this.getResourceBundle().getText("warningSequencedTasksInPast"));
					}
				}
				oModel.setProperty("plannedStart", oPlannedStart, oBC);
				oModel.setProperty("plannedEnd", oPlannedEnd, oBC);
				oModel.setProperty("estimatedEnd", oPlannedEnd, oBC);
			}
			oViewModel.setProperty("/busy", true);
			oModel.submitChanges({
				success: function () {
					oViewModel.setProperty("/busy", false);
				},
				error: function (oError) {
					oViewModel.setProperty("/busy", false);
					Log.error("Errr updating task: " + JSON.strimgify(oError));
				}
			});
			this._clearModelsOfSelections();
		},

		sequenceAllTasks: function () {
			// sequences all tasks in all rows from a starting point
			// ensures both space and resources are available
			var oModel = this.getModel(),
				oViewModel = this.getModel("stateModel"),
				oPC = {
					rows: []
				},
				aRows = this.byId("planningBoard").getRows(),
				aTasksOfRow = [],
				aFilteredTasksOfRow = [],
				iStatus,
				oNow = new Date(),
				oScheduleStart = oNow,
				oLocationStartDate,
				oLastStartedTaskEnd,
				iCount = 0,
				oTaskBC,
				oShift,
				oStart,
				oEnd,
				aSearchTasks,
				bNoWorkforceAssigned = false,
				sConfirmMsg = "",
				sIcon = sap.m.MessageBox.Icon.INFORMATION,
				that = this;

			// build a js model of the planning calendar wih tasks to be scheduled
			for (var i = 0; i < aRows.length; i++) {
				// sort and filter tasks of each row
				aTasksOfRow = aRows[i].getAppointments();
				aTasksOfRow.sort(function (a, b) {
					return a.getStartDate().getTime() - b.getStartDate().getTime();
				});
				aFilteredTasksOfRow = [];
				for (var j = 0; j < aTasksOfRow.length; j++) {
					iStatus = aTasksOfRow[j].getBindingContext().getProperty("status");
					if (iStatus > 1) { // started, don't schedule; take the last end inc. wait as start of the row
						oLastStartedTaskEnd = new Date(aTasksOfRow[j].getBindingContext().getProperty("estimatedEnd").getTime() +
							aTasksOfRow[j].getBindingContext().getProperty("waitDuration"));
						oScheduleStart = (oLastStartedTaskEnd > oNow) ? oLastStartedTaskEnd : oNow;
					} else {
						if (oScheduleStart.getTime() === oNow.getTime()) { // oScheduleStart not yet changed
							oLocationStartDate = aRows[i].getBindingContext().getProperty("startDate");
							// take the planned start date of the location as earliest start if later
							if (oLocationStartDate.getTime() > oNow.getTime()) {
								oScheduleStart = oLocationStartDate;
								MessageToast.show(this.getResourceBundle().getText("earliestStartFromLocation"));
							}
						}
						// check if workforce is assigned
						if (this._getCrewIDsOfTask(aTasksOfRow[j]).length === 0 &&
							this._getWorkerIDsOfTask(aTasksOfRow[j]).length === 0) {
							bNoWorkforceAssigned = true;
						}
						aFilteredTasksOfRow.push(aTasksOfRow[j]);
					}
				}
				if (aFilteredTasksOfRow.length > 0) {
					iCount += aFilteredTasksOfRow.length;
					oPC.rows.push({
						row: aRows[i],
						tasks: aFilteredTasksOfRow,
						start: oScheduleStart
					});
				}
			}
			// check if there are tasks without workforce assignment
			// ask for confirmation
			if (bNoWorkforceAssigned) {
				sConfirmMsg += that.getResourceBundle().getText("msgMissingWorkforce") + "\n";
				sIcon = sap.m.MessageBox.Icon.WARNING;
			}
			sConfirmMsg += iCount + " " + that.getResourceBundle().getText("confirmMsgSequenceSameTaskText");

			MessageBox.confirm(sConfirmMsg, {
				title: that.getResourceBundle().getText("titleConfirmMsgSequenceSameTasks"),
				icon: sIcon,
				onClose: function (oAction) {
					if (oAction !== "OK") {
						return;
					} else {
						for (i = 0; i < oPC.rows.length; i++) {
							oStart = oPC.rows[i].start;
							oPC.rows[i].tasks = oPC.rows[i].tasks.reduce(function (aTasks, oTask) {
								oTaskBC = oTask.getBindingContext();
								oShift = that.getShiftFromID(oTaskBC.getProperty("shift_ID"));
								oStart = that.getStartDateInWorkingHours(oStart, oShift);
								oEnd = that.getEndDateInWorkingHours(oStart, oTaskBC.getProperty("quantity"),
									oTaskBC.getProperty("plannedProductivity") * oTaskBC.getProperty("productivityFactor"), oShift);
								if (i > 0) { // first row is not to be checked against workforce over allocation
									// create an array of all tasks in previous rows
									aSearchTasks = [];
									for (j = 0; j < i; j++) {
										aSearchTasks.push(oPC.rows[j].tasks);
									}
									if (aSearchTasks.length > 0) {
										oTask.setStartDate(oStart); // set dates for getStartFromWorkforce
										oTask.setEndDate(oEnd);
										oStart = that.getStartFromWorkforce(oTask, aSearchTasks, i);
										oStart = that.getStartDateInWorkingHours(oStart, oShift);
										oEnd = that.getEndDateInWorkingHours(oStart, oTaskBC.getProperty("quantity"),
											oTaskBC.getProperty("plannedProductivity") * oTaskBC.getProperty("productivityFactor"), oShift);
									}
								}
								// now set the models with the final dates
								// set the new date values for the task in the js model for searching workforce
								oTask.setStartDate(oStart);
								oTask.setEndDate(oEnd); //!! does it mean it displays the end date without wait time???
								oModel.setProperty("plannedStart", new Date(oStart), oTaskBC);
								oModel.setProperty("plannedEnd", new Date(oEnd), oTaskBC);
								oModel.setProperty("estimatedEnd", new Date(oEnd), oTaskBC);
								// build the new task array of the row
								aTasks.push(oTask);
								// set start for the next task
								oStart = new Date(oEnd.getTime() + oTaskBC.getProperty("waitDuration"));
								return aTasks;
							}, []);
						}
						oViewModel.setProperty("/busy", true);
						oModel.submitChanges({
							success: function (oData) {
								oViewModel.setProperty("/busy", false);
							},
							error: function (oError) {
								oViewModel.setProperty("/busy", false);
								Log.error("Error sequencing Tasks" + JSON.stringify(oError));
							}
						});
					}
				}
			});
		},

		sequenceSelectedTasks: function () { // returns if a task already was started
			var oPC = this.byId("planningBoard"),
				//aSelectedTaskIDs = oPC.getSelectedAppointments(), // not in the order of selection
				// take the selection from the model as it preserves the sequence of selection
				aSelectedTaskControlIDs = this.getModel("appView").getProperty("/selectedTaskControlIDs"),
				oTask = {},
				aSelectedTasks = [],
				oTaskContext,
				oModel = this.getModel(),
				oViewModel = this.getModel("stateModel"),
				oShift,
				oPlannedStart,
				oPlannedEnd,
				oLastDate,
				bPull = this.getModel("appView").getProperty("/pullMode"),
				iWaitMs,
				iLastStartInSameRow,
				iLastEndInSameRow;

			for (var i = 0; i < aSelectedTaskControlIDs.length; i++) {
				//oTask = this.byId(aSelectedTaskIDs[i]); // not working
				oTask = sap.ui.getCore().byId(aSelectedTaskControlIDs[i]);
				aSelectedTasks.push(oTask);
			}
			for (i = 1; i < aSelectedTasks.length; i++) { // check for tasks that already started; first one can be started
				if (aSelectedTasks[i].getBindingContext().getProperty("status") > 1) {
					MessageBox.error(this.getResourceBundle().getText("errorSequencingStartedTask"));
					return;
				}
			}
			for (i = 0; i < aSelectedTasks.length; i++) {
				aSelectedTasks[i].setSelected(false);
				oTaskContext = aSelectedTasks[i].getBindingContext();
				if (i > 0) { // all tasks for i > 0 cannot be started
					oShift = this.getShiftFromID(oTaskContext.getProperty("shift_ID"));
					if (bPull) { // sequence backwards
						for (var j = 0; j < i; j++) { // search the tasks after
							if (aSelectedTasks[i].getParent().getId() === aSelectedTasks[j].getParent().getId()) {
								iLastStartInSameRow = aSelectedTasks[j].getBindingContext().getProperty("plannedStart").getTime();
								if ((oLastDate.getTime() + oTaskContext.getProperty("waitDuration")) > iLastStartInSameRow) {
									oLastDate = new Date(iLastStartInSameRow - oTaskContext.getProperty("waitDuration")); // put the end of wait before the start
								}
							}
						}
						oPlannedEnd = new Date(oLastDate.getTime());
						oPlannedEnd = this.getPullEndDateInWorkingHours(oPlannedEnd, oShift);
						oPlannedStart = this.getPullStartDateInWorkingHours(oPlannedEnd, oTaskContext.getProperty("quantity"),
							oTaskContext.getProperty("plannedProductivity") * oTaskContext.getProperty("productivityFactor"), oShift);
					} else { // sequence forward
						for (var j = 0; j < i; j++) { // search the tasks before
							if (aSelectedTasks[i].getParent().getId() === aSelectedTasks[j].getParent().getId()) {
								iLastEndInSameRow = aSelectedTasks[j].getBindingContext().getProperty("estimatedEnd").getTime() +
									aSelectedTasks[j].getBindingContext().getProperty("waitDuration");
								if (oLastDate.getTime() < iLastEndInSameRow) {
									oLastDate = new Date(iLastEndInSameRow); // put it at end of latest waiting time end
								}
							}
						}
						oPlannedStart = this.getStartDateInWorkingHours(oLastDate, oShift); // make sure that after adding waitDuration start is within shift
						oPlannedEnd = this.getEndDateInWorkingHours(oPlannedStart, oTaskContext.getProperty("quantity"),
							oTaskContext.getProperty("plannedProductivity") * oTaskContext.getProperty("productivityFactor"), oShift);
					}
					if (oPlannedStart.getTime() < new Date().getTime()) {
						MessageToast.show(this.getResourceBundle().getText("warningSequencedTasksInPast"));
					}
					oModel.setProperty("plannedStart", oPlannedStart, oTaskContext);
					oModel.setProperty("plannedEnd", oPlannedEnd, oTaskContext);
					oModel.setProperty("estimatedEnd", oPlannedEnd, oTaskContext);
				}
				// set lastDate
				if (bPull) { // sequence backwards
					if (oTaskContext.getProperty("status") > 1) { // started
						oLastDate = oTaskContext.getProperty("actualStart");
					} else {
						oLastDate = oTaskContext.getProperty("plannedStart");
					}
				} else { // sequence forward
					oLastDate = oTaskContext.getProperty("estimatedEnd"); // waitDuration is added above
				}
			}
			oViewModel.setProperty("/busy", true);
			oModel.submitChanges({
				success: function () {
					oViewModel.setProperty("/busy", false);
				},
				error: function (oError) {
					oViewModel.setProperty("/busy", false);
					Log.error("Error sequencing Tasks" + JSON.stringify(oError));
				}
			});
			this._clearModelsOfSelections();
		},

		sequenceSameTasks: function () { // returns if a task already was started
			var oPC = this.byId("planningBoard"),
				oSelectedTask = sap.ui.getCore().byId(oPC.getSelectedAppointments()[0]),
				oTaskBC = oSelectedTask.getBindingContext(),
				sSelectedTaskID = oTaskBC.getProperty("ID"),
				sTaskName = oTaskBC.getProperty("taskName"),
				oLastEnd = oTaskBC.getProperty("estimatedEnd"),
				oMinDate = (oTaskBC.getProperty("status") > 1) ? oTaskBC.getProperty("actualStart") : oTaskBC.getProperty("plannedStart"),
				iLastEndInSameRow,
				oStart,
				oEnd,
				aRows = oPC.getRows(),
				aTasks,
				iWait,
				aSameTasks = [],
				oModel = this.getModel(),
				oShift,
				bPull = this.getModel("appView").getProperty("/pullMode"),
				that = this;

			// find "same" tasks (not started and in the future)
			for (var i = 0; i < aRows.length; i++) {
				aTasks = aRows[i].getAppointments();
				for (var j = 0; j < aTasks.length; j++) {
					oTaskBC = aTasks[j].getBindingContext();
					if (oTaskBC.getProperty("status") < 2 && oTaskBC.getProperty("taskName") === sTaskName &&
						oTaskBC.getProperty("ID") !== sSelectedTaskID && oTaskBC.getProperty("plannedStart") >= oMinDate) {
						aSameTasks.push(aTasks[j]);
					}
				}
			}
			if (aSameTasks.length === 0) {
				MessageBox.error(this.getResourceBundle().getText("noSameTasksFound"));
				return;
			}
			// sort same tasks by plannedStart
			aSameTasks.sort(function (a, b) {
				return a.getBindingContext().getProperty("plannedStart").getTime() -
					b.getBindingContext().getProperty("plannedStart").getTime();
			});
			// add the selected task at the beginning
			aSameTasks.unshift(oSelectedTask);
			// show affected tasks and ask for OK
			for (i = 1; i < aSameTasks.length; i++) {
				aSameTasks[i].setSelected(true);
			}
			this.getModel("stateModel").setProperty("/noOfSelectedTasks", aSameTasks.length - 1);
			MessageBox.confirm(aSameTasks.length + " " + that.getResourceBundle().getText("confirmMsgSequenceSameTaskText"), {
				title: that.getResourceBundle().getText("titleConfirmMsgSequenceSameTasks"),
				onClose: function (oAction) {
					if (oAction !== "OK") {
						for (i = 0; i < aSameTasks.length; i++) {
							aSameTasks[i].setSelected(false);
						}
						that._clearModelsOfSelections();
						return;
					} else {
						// iterate starting with the second
						for (i = 1; i < aSameTasks.length; i++) {
							oTaskBC = aSameTasks[i].getBindingContext();
							oShift = that.getShiftFromID(oTaskBC.getProperty("shift_ID"));
							oLastEnd = that.getStartDateInWorkingHours(oLastEnd, oShift); // in case the task is in a different shift
							// add waiting time if in same row
							for (j = 0; j < i; j++) { // search the tasks before
								if (aSameTasks[i].getParent().getId() === aSameTasks[j].getParent().getId()) {
									iLastEndInSameRow = aSameTasks[j].getBindingContext().getProperty("estimatedEnd").getTime() +
										aSameTasks[j].getBindingContext().getProperty("waitDuration");
									if (oLastEnd.getTime() < iLastEndInSameRow) {
										oLastEnd = new Date(iLastEndInSameRow); // put it at end of latest waiting time end
									}
								}
							}
							oStart = that.getStartDateInWorkingHours(oLastEnd, oShift); // in case wait end is not in shift
							oModel.setProperty("plannedStart", new Date(oStart), oTaskBC);
							oEnd = that.getEndDateInWorkingHours(oStart, oTaskBC.getProperty("quantity"),
								oTaskBC.getProperty("plannedProductivity") * oTaskBC.getProperty("productivityFactor"), oShift);
							oModel.setProperty("plannedEnd", new Date(oEnd), oTaskBC);
							oModel.setProperty("estimatedEnd", new Date(oEnd), oTaskBC);
							oLastEnd = new Date(oEnd);
						}
						oModel.submitChanges({
							error: function (oError) {
								Log.error("Error sequencing same tasks: " + JSON.stringify(oError));
							}
						});
						for (i = 0; i < aSameTasks.length; i++) {
							aSameTasks[i].setSelected(false);
						}
						that._clearModelsOfSelections();
					}
				}
			});
		},

		sequenceRowTasks: function () {
			// sequences tasks of a row in the future of a selected task
			var oPC = this.byId("planningBoard"),
				oSelectedTask = sap.ui.getCore().byId(oPC.getSelectedAppointments()[0]),
				oTaskBC = oSelectedTask.getBindingContext(),
				sSelectedTaskID = oTaskBC.getProperty("ID"),
				oMinDate = (oTaskBC.getProperty("status") > 1) ? oTaskBC.getProperty("actualStart") : oTaskBC.getProperty("plannedStart"),
				oLastEnd = new Date(oTaskBC.getProperty("estimatedEnd").getTime() + oTaskBC.getProperty("waitDuration")),
				oRow = this.byId(oSelectedTask.getParent().getId()),
				aTasks = oRow.getAppointments(),
				aFutureTasks = [],
				oModel = this.getModel(),
				oShift,
				oStart,
				oEnd,
				that = this;

			// find future tasks (not started) in the same row
			for (var i = 0; i < aTasks.length; i++) {
				if (aTasks[i].getBindingContext().getProperty("status") <= 1 &&
					aTasks[i].getBindingContext().getProperty("plannedStart") >= oMinDate) {
					aFutureTasks.push(aTasks[i]);
					aTasks[i].setSelected(true);
				}
			}
			if (aFutureTasks.length === 0) {
				MessageBox.error(this.getResourceBundle().getText("noFutureTasksFound"));
				return;
			}
			// sort future tasks by plannedStart
			aFutureTasks.sort(function (a, b) {
				return a.getBindingContext().getProperty("plannedStart").getTime() -
					b.getBindingContext().getProperty("plannedStart").getTime();
			});
			this.getModel("stateModel").setProperty("/noOfSelectedTasks", aFutureTasks.length + 1);
			MessageBox.confirm(aFutureTasks.length + " " + that.getResourceBundle().getText("confirmMsgSequenceSameTaskText"), {
				title: that.getResourceBundle().getText("titleConfirmMsgSequenceSameTasks"),
				onClose: function (oAction) {
					if (oAction !== "OK") {
						for (i = 0; i < aFutureTasks.length; i++) {
							oSelectedTask.setSelected(false);
							aFutureTasks[i].setSelected(false);
						}
						that._clearModelsOfSelections();
						return;
					} else {
						for (i = 0; i < aFutureTasks.length; i++) {
							// all end dates including wait duration
							oTaskBC = aFutureTasks[i].getBindingContext();
							oShift = that.getShiftFromID(oTaskBC.getProperty("shift_ID"));
							oStart = that.getStartDateInWorkingHours(oLastEnd, oShift);
							oModel.setProperty("plannedStart", new Date(oStart), oTaskBC);
							oEnd = that.getEndDateInWorkingHours(oStart, oTaskBC.getProperty("quantity"),
								oTaskBC.getProperty("plannedProductivity") * oTaskBC.getProperty("productivityFactor"), oShift);
							oModel.setProperty("plannedEnd", new Date(oEnd), oTaskBC);
							oModel.setProperty("estimatedEnd", new Date(oEnd), oTaskBC);
							oLastEnd = new Date(oEnd.getTime() + oTaskBC.getProperty("waitDuration"));
						}
						oModel.submitChanges({
							error: function (oError) {
								Log.error("Error sequencing tasks in a row: " + JSON.stringify(oError));
							}
						});
						oSelectedTask.setSelected(false);
						for (i = 0; i < aFutureTasks.length; i++) {
							aFutureTasks[i].setSelected(false);
						}
						that._clearModelsOfSelections();
					}
				}
			});
		},

		onCopy: function () {
			var oViewModel = this.getModel("stateModel"),
				aSelectedTaskIDs = this.byId("planningBoard").getSelectedAppointments();

			if (aSelectedTaskIDs.length === 0) {
				return;
			}
			oViewModel.setProperty("/mode", "Copy");
			oViewModel.setProperty("/tasksToCopy", aSelectedTaskIDs);
		},

		onPaste: function () {
			var oViewModel = this.getModel("stateModel"),
				oAppViewModel = this.getModel("appView"),
				aSelectedTaskIDs = oViewModel.getProperty("/tasksToCopy"),
				aSelectedTasks = [],
				oTask,
				oShift,
				iTimeShift,
				iNameIndex,
				that = this,
				sProjectID = this.getModel("appView").getProperty("/selectedProjectID"),
				bPull = this.getModel("appView").getProperty("/pullMode"),
				iPasteDateMs;

			if (aSelectedTaskIDs.length === 0 || !oAppViewModel.getProperty("/activeStartDate")) {
				return;
			}
			if (oViewModel.getProperty("/mode") === "Copy") { // execute paste
				if (oAppViewModel.getProperty("/activeStartDate") !== oViewModel.getProperty("/startDate") ||
					oAppViewModel.getProperty("/activeRowID") !== oViewModel.getProperty("/selectedLocationID")) {
					// start paste 
					for (var i = 0; i < aSelectedTaskIDs.length; i++) {
						//oTask = this.byId(aSelectedTaskIDs[i]).getBindingContext().getObject({ // not working
						oTask = sap.ui.getCore().byId(aSelectedTaskIDs[i]).getBindingContext().getObject({
							select: "*"
						});
						aSelectedTasks.push(oTask);
					}
					iPasteDateMs = oAppViewModel.getProperty("/activeStartDate").getTime();
					if (bPull) {
						iTimeShift = iPasteDateMs - aSelectedTasks[0].estimatedEnd.getTime();
					} else {
						iTimeShift = aSelectedTasks[0].actualStart ? iPasteDateMs - aSelectedTasks[0].actualStart.getTime() :
							iPasteDateMs - aSelectedTasks[0].plannedStart.getTime();
					}

					oViewModel.setProperty("/busy", true);
					// collect the next taskNumber for each taskName first
					this._getTaskNamesWithNumbers(sProjectID, aSelectedTasks).then(function (aNamesNumbers) {
						// thanks to trincot: https://stackoverflow.com/questions/40328932/javascript-es6-promise-for-loop/40329190
						aSelectedTasks.reduce(function (p, v, j, aArray) {
							new Promise(function (resolve) {
								oShift = that.getShiftFromID(v.shift_ID);
								oTask = {};
								oTask.ID = undefined;
								oTask.project_ID = v.project_ID;
								oTask.taskName = v.taskName;
								iNameIndex = aNamesNumbers.findIndex(function (oValue) {
									return oValue.taskName === v.taskName;
								});
								oTask.number = aNamesNumbers[iNameIndex].taskNumber;
								aNamesNumbers[iNameIndex].taskNumber += 1; // increment for the next task
								oTask.shortText = v.shortText;
								oTask.description = v.description;
								oTask.recipe_ID = v.recipe_ID;
								oTask.pulseStep_ID = v.pulseStep_ID;
								oTask.UoM_ID = v.UoM_ID;
								oTask.shift_ID = v.shift_ID;
								oTask.quantity = v.quantity;
								oTask.plannedProductivity = v.plannedProductivity;
								oTask.productivityFactor = v.productivityFactor;
								oTask.currentProductivity = v.plannedProductivity * v.productivityFactor;
								oTask.currentProductivity = oTask.currentProductivity.toFixed(3);
								oTask.KPI = "1.000";
								oTask.discipline_ID = v.discipline_ID;
								oTask.colour = v.colour;
								oTask.location_ID = oAppViewModel.getProperty("/activeRowID");
								if (bPull) {
									oTask.plannedEnd = new Date(v.estimatedEnd.getTime() + iTimeShift);
									oTask.plannedEnd = that.getPullEndDateInWorkingHours(oTask.plannedEnd, oShift);
									oTask.estimatedEnd = oTask.plannedEnd;
									oTask.plannedStart = that.getPullStartDateInWorkingHours(oTask.plannedEnd, v.quantity, v.plannedProductivity * v.productivityFactor,
										oShift);
								} else {
									oTask.plannedStart = new Date(v.plannedStart.getTime() + iTimeShift);
									oTask.plannedStart = that.getStartDateInWorkingHours(oTask.plannedStart, oShift);
									oTask.plannedEnd = that.getEndDateInWorkingHours(oTask.plannedStart, v.quantity, v.plannedProductivity * v.productivityFactor,
										oShift);
									oTask.estimatedEnd = oTask.plannedEnd;
								}
								oTask.actualStart = undefined;
								oTask.actualEnd = undefined;
								oTask.stoppedAt = undefined;
								oTask.stopDuration = undefined;
								oTask.status = 0;
								oTask.buffer = v.buffer;
								oTask.waitDuration = v.waitDuration;
								oTask.supervisor_ID = v.supervisor_ID;
								that.createTaskWithCrewsAndWorkers(v.ID, oTask, v.project_ID).then(function () {
									oViewModel.setProperty("/busy", false);
								});
							});
						}, Promise.resolve());
					});
					//oViewModel.setProperty("/mode", "None");
					oViewModel.setProperty("/noOfSelectedTasks", 0);
					oViewModel.setProperty("/tasksMultiSelected", false);
					//oViewModel.setProperty("/tasksToCopy", []);
				} else {
					MessageBox.error(this.getResourceBundle().getText("rowOrStartSelectionError"));
				}
			}
		},

		createTrains: function () {
			var oPC = this.byId("planningBoard"),
				aSelectedTaskIDs = oPC.getSelectedAppointments(),
				aSelectedTasks = [],
				oTask1 = {},
				aRows = oPC.getRows(),
				oRowID,
				//oSourceRow = this.byId(aSelectedTaskIDs[0]).getParent(), // not working
				oSourceRow = sap.ui.getCore().byId(aSelectedTaskIDs[0]).getParent(),
				sSourceRowID = oSourceRow.getBindingContext().getObject().ID, // only tasks of one row are selected
				aDestinationRowIDs = [],
				that = this,
				aBuffersToLastTask = [], // in ms
				oPreviousStart,
				oThisEnd,
				oThisStart,
				oLastEnd,
				mBufferHours,
				aTaskEndDates,
				aTaskStartDates,
				sProjectID = this.getModel("appView").getProperty("/selectedProjectID"),
				oStateModel = this.getModel("stateModel"),
				iNameIndex,
				oShift,
				bPull = this.getModel("appView").getProperty("/pullMode"),
				bAbort = false;

			// check if destination rows exist
			if (aRows.length <= 1) {
				MessageBox.error(this.getResourceBundle().getText("noRowsToCreateTrains"));
				return;
			}
			// prepare the tasks to be copied
			for (var i = 0; i < aSelectedTaskIDs.length; i++) {
				oTask1 = sap.ui.getCore().byId(aSelectedTaskIDs[i]).getBindingContext().getObject({
					select: "*"
				});
				if (sap.ui.getCore().byId(aSelectedTaskIDs[i]).getParent().getBindingContext().getObject().ID !== sSourceRowID) {
					MessageBox.error(this.getResourceBundle().getText("trainNotInOneRowError"));
					return; // selected tasks must all be in the selected row
				}
				aSelectedTasks.push(oTask1);
			}
			// sort by  start date
			aSelectedTasks.sort(function (a, b) {
				var oAStartDate = (a.status > 1) ? a.actualStart : a.plannedStart,
					oBStartDate = (b.status > 1) ? b.actualStart : b.plannedStart;
				return oAStartDate - oBStartDate;
			});
			// reverse sorting for pull mode
			if (bPull) {
				aSelectedTasks.reverse();
			}
			// determine the buffers between tasks, starting from second
			// buffers are in addition to waiting time
			for (i = 1; i < aSelectedTasks.length; i++) {
				if (bPull) {
					oPreviousStart = (aSelectedTasks[i - 1].status > 1) ? aSelectedTasks[i - 1].actualStart : aSelectedTasks[i - 1].plannedStart;
					oThisEnd = new Date(aSelectedTasks[i].estimatedEnd.getTime() + aSelectedTasks[i].waitDuration);
					mBufferHours = this.getNetDurationHoursFromDates(oPreviousStart, oThisEnd, this.getShiftFromID(aSelectedTasks[i].shift_ID));
					aBuffersToLastTask.push(Math.round(mBufferHours * 60 * 60 * 1000)); // in ms
				} else {
					oThisStart = (aSelectedTasks[i].status > 1) ? aSelectedTasks[i].actualStart : aSelectedTasks[i].plannedStart;
					oLastEnd = new Date(aSelectedTasks[i - 1].estimatedEnd.getTime() + aSelectedTasks[i - 1].waitDuration);
					mBufferHours = this.getNetDurationHoursFromDates(oThisStart, oLastEnd, this.getShiftFromID(aSelectedTasks[i].shift_ID));
					aBuffersToLastTask.push(Math.round(mBufferHours * 60 * 60 * 1000));
				}
			}
			// create a matrix array for all tasks to store end dates (used in push mode)
			aTaskEndDates = new Array(aRows.length);
			for (i = 0; i < aRows.length; i++) {
				aTaskEndDates[i] = new Array(aSelectedTasks.length);
			}
			// fill the first row with existing tasks
			for (i = 0; i < aSelectedTasks.length; i++) {
				aTaskEndDates[0][i] = aSelectedTasks[i].estimatedEnd;
			}
			// create a matrix array for all tasks to store start dates (used in pull mode)
			aTaskStartDates = new Array(aRows.length);
			for (i = 0; i < aRows.length; i++) {
				aTaskStartDates[i] = new Array(aSelectedTasks.length);
			}
			// fill the first row with existing tasks
			for (i = 0; i < aSelectedTasks.length; i++) {
				if (i === 0 && aSelectedTasks.status > 1) { // only the first one can be started already
					aTaskStartDates[0][i] = aSelectedTasks[i].actualStart;
				} else {
					aTaskStartDates[0][i] = aSelectedTasks[i].plannedStart;
				}
			}
			// fill destination rows array
			for (i = 0; i < aRows.length; i++) {
				oRowID = aRows[i].getBindingContext().getObject().ID;
				if (oRowID !== sSourceRowID) {
					aDestinationRowIDs.push(oRowID);
				} else { // check if in pull mode the destination rows are above and below in push mode
					if (bPull && i !== aRows.length - 1) {
						MessageBox.error(this.getResourceBundle().getText("wrongRowSequenceInPullMode"));
						return;
					}
					if (!bPull && i !== 0) {
						MessageBox.error(this.getResourceBundle().getText("wrongRowSequenceInPushMode"));
						return;
					}
				}
			}
			// reverse the row IDs for pull mode
			if (bPull) {
				aDestinationRowIDs.reverse();
			}
			// the Takt is taken from the stored start/end dates
			oStateModel.setProperty("/busy", true);
			this._getTaskNamesWithNumbers(sProjectID, aSelectedTasks).then(function (aNamesNumbers) {
				aSelectedTasks.reduce(function (p, v, j, aArray) {
					aDestinationRowIDs.reduce(function (q, w, k, aDestArray) {
						new Promise(function (resolve) {
							oShift = that.getShiftFromID(v.shift_ID);
							var oTask = {}; // had errors using v directly
							oTask.ID = undefined;
							oTask.project_ID = v.project_ID;
							oTask.taskName = v.taskName;
							iNameIndex = aNamesNumbers.findIndex(function (oValue) {
								return oValue.taskName === v.taskName;
							});
							oTask.number = aNamesNumbers[iNameIndex].taskNumber;
							aNamesNumbers[iNameIndex].taskNumber += 1; // increment for the next task with same name
							oTask.shortText = v.shortText;
							oTask.description = v.description;
							oTask.recipe_ID = v.recipe_ID;
							oTask.pulseStep_ID = v.pulseStep_ID;
							oTask.UoM_ID = v.UoM_ID;
							oTask.shift_ID = v.shift_ID;
							oTask.quantity = v.quantity;
							oTask.plannedProductivity = v.plannedProductivity;
							oTask.productivityFactor = v.productivityFactor;
							oTask.currentProductivity = v.currentProductivity;
							oTask.KPI = "1.000";
							oTask.discipline_ID = v.discipline_ID;
							oTask.colour = v.colour;
							oTask.location_ID = w;
							// j is the index of the wagons (tasks) 
							// k is the index of the destinatio rows; the source row is not included
							if (j > 0) { // consecutive task
								if (bPull) {
									oTask.plannedEnd = new Date(aTaskStartDates[k + 1][j - 1]);
									// add waiting time and buffer
									oTask.plannedEnd = new Date(oTask.plannedEnd.getTime() - v.waitDuration - aBuffersToLastTask[j - 1]);
									// check if crew is still working 
									if (oTask.plannedEnd > aTaskStartDates[k][j]) {
										oTask.plannedEnd = new Date(aTaskStartDates[k][j]);
									}
								} else {
									// consecutive task
									oTask.plannedStart = new Date(aTaskEndDates[k + 1][j - 1]);
									// add the waiting time and buffer
									oTask.plannedStart = new Date(oTask.plannedStart.getTime() + aSelectedTasks[j - 1].waitDuration +
										aBuffersToLastTask[j - 1]);
									// check if crew already finished last task in previous row (task row up and to the left)
									if (oTask.plannedStart < aTaskEndDates[k][j]) {
										oTask.plannedStart = new Date(aTaskEndDates[k][j]);
									}
								}
							} else { // first task in a new row
								if (bPull) {
									oTask.plannedEnd = aTaskStartDates[k][j];
								} else {
									oTask.plannedStart = aTaskEndDates[k][j];
								}
							}
							// adjust dates to shift
							if (bPull) {
								oTask.plannedEnd = new Date(that.getPullEndDateInWorkingHours(oTask.plannedEnd, oShift));
								oTask.plannedStart = new Date(that.getPullStartDateInWorkingHours(oTask.plannedEnd, v.quantity, v.plannedProductivity *
									v.productivityFactor, oShift).getTime());
								oTask.estimatedEnd = oTask.plannedEnd;
								// store end date in matrix
								aTaskStartDates[k + 1][j] = oTask.plannedStart;
								if (!bAbort && oTask.plannedStart < new Date()) { // would be in the past; abort
									oStateModel.setProperty("/busy", false);
									MessageBox.error(that.getResourceBundle().getText("taskToBeCreatedInThePast"));
									bAbort = true;
									return;
								}
							} else {
								oTask.plannedStart = new Date(that.getStartDateInWorkingHours(oTask.plannedStart, oShift).getTime());
								oTask.plannedEnd = new Date(that.getEndDateInWorkingHours(oTask.plannedStart, v.quantity, v.plannedProductivity * v.productivityFactor,
									oShift).getTime());
								oTask.estimatedEnd = oTask.plannedEnd;
								// store end date in matrix
								aTaskEndDates[k + 1][j] = oTask.plannedEnd;
							}
							oTask.actualStart = undefined;
							oTask.actualEnd = undefined;
							oTask.stoppedAt = undefined;
							oTask.stopDuration = undefined;
							oTask.status = 0;
							oTask.buffer = v.buffer;
							oTask.waitDuration = v.waitDuration;
							oTask.supervisor_ID = v.supervisor_ID;

							oStateModel.setProperty("/busy", true);
							if (!bAbort) {
								// creates the new task and copies workforce
								that.createTaskWithCrewsAndWorkers(v.ID, oTask, sProjectID).then(function () {
									oStateModel.setProperty("/busy", false);
								});
							} else {
								oStateModel.setProperty("/busy", false);
							}
						});
					}, Promise.resolve());
				}, Promise.resolve());
			});
			oStateModel.setProperty("/noOfSelectedTasks", 0);
		},

		createTaskWithCrewsAndWorkers: function (sOldTaskID, oTask, sProjectID) {
			var oModel = this.getModel(),
				sOldTaskPath = oModel.createKey("/Tasks", {
					ID: sOldTaskID
				}),
				that = this,
				oOldTaskBC = oModel.createBindingContext(sOldTaskPath),
				aCrews = oOldTaskBC.getProperty("crews"),
				aWorkers = oOldTaskBC.getProperty("workers"),
				createTask = function (oTaskValues) {
					return new Promise(function (resolve, reject) {
						oModel.create("/Tasks", oTaskValues, {
							success: function (oNewTask) {
								resolve(oNewTask.ID);
							},
							error: function (oError) {
								Log.error("Error creating task: " + JSON.stringify(oError));
								reject();
							}
						});
					});
				},
				createCrews = function (sTaskID) {
					return new Promise(function (resolve) {
						aCrews.reduce(function (p, v, i) {
							var oCrewForTask = {},
								sCrewID = oModel.createBindingContext("/" + v).getProperty("crew_ID");
							oCrewForTask.project_ID = sProjectID;
							oCrewForTask.crew_ID = sCrewID;
							oCrewForTask.task_ID = sTaskID;
							oModel.create("/CrewsForTask", oCrewForTask, {
								success: function (oData) {
									MessageToast.show(that.getResourceBundle().getText("msgWorkforceCopied"));
								},
								error: function (oError) {
									Log.error("Error copying crew: " + JSON.stringify(oError));
								},
								groupId: String(i)
							});
						}, Promise.resolve());
					});
				},
				createWorkers = function (sTaskID) {
					return new Promise(function (resolve) {
						aWorkers.reduce(function (p, v, i) {
							var oWorkerForTask = {},
								sWorkerID = oModel.createBindingContext("/" + v).getProperty("worker_ID");
							oWorkerForTask.project_ID = sProjectID;
							oWorkerForTask.worker_ID = sWorkerID;
							oWorkerForTask.task_ID = sTaskID;
							oModel.create("/WorkersForTask", oWorkerForTask, {
								success: function (oData) {
									MessageToast.show(that.getResourceBundle().getText("msgWorkforceCopied"));
								},
								error: function (oError) {
									Log.error("Error copying worker: " + JSON.stringify(oError));
								},
								groupId: String(i)
							});
						}, Promise.resolve());
					});
				};

			return new Promise(function (resolve) {
				createTask(oTask)
					.then(function (sNewTaskID) {
						if (sNewTaskID) {
							createCrews(sNewTaskID);
							createWorkers(sNewTaskID);
						}
					}).then(function () {
						resolve();
					});
			});
		},

		distributeProductivity: function () {
			var oModel = this.getModel(),
				oStateModel = this.getModel("stateModel"),
				aSelectedTaskIDs = this.byId("planningBoard").getSelectedAppointments(),
				oBC,
				oFrag = sap.ui.core.Fragment;

			oBC = sap.ui.getCore().byId(aSelectedTaskIDs[0]).getBindingContext();
			this._createPromoteProductivityDialog();
			if (this.oPromoteProductivityDialog) {
				oStateModel.setProperty("/propagateTaskName", oBC.getProperty("taskName")); // go event uses it
				oStateModel.setProperty("/propagateStartDate", oBC.getProperty("estimatedEnd"));
				this.oPromoteProductivityDialog.setBindingContext(oBC);
				oFrag.byId("promoteProdFrag", "prodFactor").setValue(oBC.getProperty("currentProductivity") /
					oBC.getProperty("plannedProductivity"));
				oFrag.byId("promoteProdFrag", "endProd").setValue(oBC.getProperty("currentProductivity") *
					1 + (oFrag.byId("promoteProdFrag", "endProdPercent").getValue() / 100));
				this.oPromoteProductivityDialog.open();
			}
		},

		_createPromoteProductivityDialog: function () {
			var oFrag = sap.ui.core.Fragment,
				oStateModel = this.getModel("stateModel"),
				sPlannedProductivity,
				sProductivityFactor,
				sNewProductivity,
				sEndProductivityPercentage,
				sEndProductivity,
				sTitle = this.getResourceBundle().getText("promoteProductivityTitle"),
				sCancel = this.getResourceBundle().getText("measurementDialogCancelButtonText"),
				sGo = this.getResourceBundle().getText("goButtonText"),
				that = this;

			if (!this.oPromoteProductivityDialog) {
				this.oPromoteProductivityDialog = new Dialog({
					title: sTitle,
					contentWidth: "33%",
					resizable: true,
					draggable: true,
					content: [
						sap.ui.xmlfragment("promoteProdFrag", "cockpit.Cockpit.view.PromoteProductivity", this)
					],
					buttons: [{
						text: sGo,
						enabled: true,
						press: function () {
							sPlannedProductivity = oFrag.byId("promoteProdFrag", "planProd").getValue();
							sProductivityFactor = oFrag.byId("promoteProdFrag", "prodFactor").getValue();
							sNewProductivity = oFrag.byId("promoteProdFrag", "newProd").getValue();
							sEndProductivityPercentage = oFrag.byId("promoteProdFrag", "endProdPercent").getValue();
							sEndProductivity = oFrag.byId("promoteProdFrag", "endProd").getValue();
							oStateModel.setProperty("/noOfSelectedTasks", 0);
							that.oPromoteProductivityDialog.close();
							that.forwardActualProductivity(sProductivityFactor, sEndProductivityPercentage,
								oStateModel.getProperty("/propagateTaskName"), oStateModel.getProperty("/propagateStartDate"));
						}
					}, {
						text: sCancel,
						enabled: true,
						press: function () {
							that.oPromoteProductivityDialog.close();
						}
					}]
				});
				this.oPromoteProductivityDialog.addStyleClass("sapUiContentPadding");
				this.getView().addDependent(that.oPromoteProductivityDialog);
			}
		},

		onProdFactorChange: function () {
			var oFrag = sap.ui.core.Fragment,
				oProductivity = oFrag.byId("promoteProdFrag", "planProd"),
				oProductivityFactor = oFrag.byId("promoteProdFrag", "prodFactor"),
				oNewProductivity = oFrag.byId("promoteProdFrag", "newProd"),
				oEndProductivityPercentage = oFrag.byId("promoteProdFrag", "endProdPercent"),
				oEndProductivity = oFrag.byId("promoteProdFrag", "endProd"),
				aButtons = this.oPromoteProductivityDialog.getButtons();

			if (oProductivityFactor.getValue() <= 0 || isNaN(oProductivityFactor.getValue())) {
				oProductivityFactor.setValueState("Error");
				oProductivityFactor.setValueStateText(this.getResourceBundle().getText("invalidProductivityFactor"));
				aButtons[0].setEnabled(false);
			} else {
				oProductivityFactor.setValueState("None");
				oProductivityFactor.setValueStateText("");
				aButtons[0].setEnabled(true);
				oNewProductivity.setValue(parseFloat(oProductivity.getValue() * oProductivityFactor.getValue()).toFixed(3));
				oEndProductivity.setValue(parseFloat(oProductivity.getValue() *
					oProductivityFactor.getValue() * (1 + oEndProductivityPercentage.getValue() / 100)).toFixed(3));
			}
			this._checkProdValueState();
		},

		onNewProdChange: function () {
			var oFrag = sap.ui.core.Fragment,
				oProductivity = oFrag.byId("promoteProdFrag", "planProd"),
				oProductivityFactor = oFrag.byId("promoteProdFrag", "prodFactor"),
				oNewProductivity = oFrag.byId("promoteProdFrag", "newProd"),
				oEndProductivityPercentage = oFrag.byId("promoteProdFrag", "endProdPercent"),
				oEndProductivity = oFrag.byId("promoteProdFrag", "endProd"),
				aButtons = this.oPromoteProductivityDialog.getButtons();

			if (oNewProductivity.getValue() <= 0 || isNaN(oNewProductivity.getValue())) {
				oNewProductivity.setValueState("Error");
				oNewProductivity.setValueStateText(this.getResourceBundle().getText("invalidNewProductivity"));
				aButtons[0].setEnabled(false);
			} else {
				oNewProductivity.setValueState("None");
				oNewProductivity.setValueStateText("");
				aButtons[0].setEnabled(true);
				oProductivityFactor.setValue(parseFloat(oNewProductivity.getValue() / oProductivity.getValue()).toFixed(3));
				oEndProductivity.setValue(parseFloat(oNewProductivity.getValue() *
					(1 + oEndProductivityPercentage.getValue() / 100)).toFixed(3));
			}
			this._checkProdValueState();
		},

		onEndProdPercentageChange: function () {
			var oFrag = sap.ui.core.Fragment,
				oProductivity = oFrag.byId("promoteProdFrag", "planProd"),
				oProductivityFactor = oFrag.byId("promoteProdFrag", "prodFactor"),
				oNewProductivity = oFrag.byId("promoteProdFrag", "newProd"),
				oEndProductivityPercentage = oFrag.byId("promoteProdFrag", "endProdPercent"),
				oEndProductivity = oFrag.byId("promoteProdFrag", "endProd"),
				aButtons = this.oPromoteProductivityDialog.getButtons();

			if (isNaN(oEndProductivityPercentage.getValue())) {
				oEndProductivityPercentage.setValueState("Error");
				oEndProductivityPercentage.setValueStateText(this.getResourceBundle().getText("invalidPercentage"));
				aButtons[0].setEnabled(false);
			} else {
				oEndProductivityPercentage.setValueState("None");
				oEndProductivityPercentage.setValueStateText("");
				aButtons[0].setEnabled(true);
				oEndProductivity.setValue(parseFloat(oNewProductivity.getValue() *
					(1 + oEndProductivityPercentage.getValue() / 100)).toFixed(3));
			}
			this._checkProdValueState();
		},

		onEndProdChange: function () {
			var oFrag = sap.ui.core.Fragment,
				oProductivity = oFrag.byId("promoteProdFrag", "planProd"),
				oProductivityFactor = oFrag.byId("promoteProdFrag", "prodFactor"),
				oNewProductivity = oFrag.byId("promoteProdFrag", "newProd"),
				oEndProductivityPercentage = oFrag.byId("promoteProdFrag", "endProdPercent"),
				oEndProductivity = oFrag.byId("promoteProdFrag", "endProd"),
				aButtons = this.oPromoteProductivityDialog.getButtons();

			if (oEndProductivity.getValue() <= 0 || isNaN(oEndProductivity.getValue())) {
				oEndProductivity.setValueState("Error");
				oEndProductivity.setValueStateText(this.getResourceBundle().getText("invalidFinalProductivity"));
				aButtons[0].setEnabled(false);
			} else {
				oEndProductivity.setValueState("None");
				oEndProductivity.setValueStateText("");
				aButtons[0].setEnabled(true);
				oEndProductivityPercentage.setValue(parseFloat((oEndProductivity.getValue() /
					oNewProductivity.getValue() - 1) * 100).toFixed(3));
			}
			this._checkProdValueState();
		},

		_checkProdValueState: function () {
			var oFrag = sap.ui.core.Fragment,
				oProductivityFactor = oFrag.byId("promoteProdFrag", "prodFactor"),
				oNewProductivity = oFrag.byId("promoteProdFrag", "newProd"),
				oEndProductivity = oFrag.byId("promoteProdFrag", "endProd"),
				aButtons = this.oPromoteProductivityDialog.getButtons();

			// delete error sates if values were corrected by changes in ther fields
			if (oProductivityFactor.getValue() > 0) {
				oProductivityFactor.setValueState("None");
				oProductivityFactor.setValueStateText("");
			}
			if (oNewProductivity.getValue() > 0) {
				oNewProductivity.setValueState("None");
				oNewProductivity.setValueStateText("");
			}
			if (oEndProductivity.getValue() > 0) {
				oEndProductivity.setValueState("None");
				oEndProductivity.setValueStateText("");
			}
			if (oProductivityFactor.getValueState() === "None" && oNewProductivity.getValueState() === "None" &&
				oEndProductivity.getValueState() === "None") {
				aButtons[0].setEnabled(true);
			} else {
				aButtons[0].setEnabled(false);
			}
		},

		addWorkForce: function () {
			var bReplace = !Device.system.phone,
				sObjectID = this.getModel("stateModel").getProperty("/selectedTaskID"),
				aSelectedTaskIDs = this.byId("planningBoard").getSelectedAppointments(),
				aSelectedTaskUUIDs = [];

			for (var i = 0; i < aSelectedTaskIDs.length; i++) {
				//aSelectedTaskUUIDs.push(this.byId(aSelectedTaskIDs[i]).getBindingContext().getObject().ID); // not working
				aSelectedTaskUUIDs.push(sap.ui.getCore().byId(aSelectedTaskIDs[i]).getBindingContext().getObject().ID);
			}
			this.getModel("appView").setProperty("/selectedTaskIDs", aSelectedTaskUUIDs);
			this.getModel("appView").setProperty("/layout", "ThreeColumnsEndExpanded");
			this.getModel("appView").setProperty("/mode", "Assign");
			this.getRouter().navTo("WorkForce", {
				ID: sObjectID
			}, bReplace);
		},

		addForeman: function () {
			var oFrag = sap.ui.core.Fragment,
				oList,
				aItems = [];

			this._createForemanDialog();
			this.getModel("stateModel").setProperty("/busy", true);
			this._filterForemanList();
			oList = oFrag.byId("addForemanFrag", "addForemanList");
			aItems = oList.getItems();
			aItems.forEach(function (oItem) {
				oList.setSelectedItem(oItem, false);
			});
			this.oAddForemanDialog.open();
		},

		_filterForemanList: function () {
			var oFrag = sap.ui.core.Fragment,
				sProjectID = this.getModel("appView").getProperty("/selectedProjectID"),
				sProfessionKey = oFrag.byId("addForemanFrag", "professionSelect").getSelectedKey(),
				aFilters = [
					new Filter("deployment/project_ID", sap.ui.model.FilterOperator.EQ, sProjectID),
					new Filter("profession/description", sap.ui.model.FilterOperator.EQ, sProfessionKey)
				],
				oAddForemanList = oFrag.byId("addForemanFrag", "addForemanList"),
				sQuery = oFrag.byId("addForemanFrag", "foremanSearchField").getValue();

			if (sQuery) {
				aFilters.push(new Filter("lastName", sap.ui.model.FilterOperator.Contains, sQuery));
			}
			oAddForemanList.getBinding("items").filter(new Filter({
				filters: aFilters,
				and: true
			}));
		},

		_createForemanDialog: function () {
			var sTitle = this.getResourceBundle().getText("addForemanTitle"),
				sCancel = this.getResourceBundle().getText("cancelButtonText"),
				that = this;

			if (!this.oAddForemanDialog) {
				this.oAddForemanDialog = new Dialog({
					title: sTitle,
					contentWidth: "800px",
					draggable: true,
					resizable: true,
					content: [
						sap.ui.xmlfragment("addForemanFrag", "cockpit.Cockpit.view.AddForeman", this)
					],
					buttons: [{
						text: sCancel,
						enabled: true,
						press: function () {
							that.oAddForemanDialog.close();
						}
					}]
				});
				this.oAddForemanDialog.addStyleClass("sapUiContentPadding");
				this.getView().addDependent(this.oAddForemanDialog);
			}
		},

		onForemanSelectionChange: function (oEvent) {
			var bSelected = oEvent.getParameter("selected"),
				oSelectedItem = oEvent.getParameter("listItem"),
				aSelectedTaskIDs = this.byId("planningBoard").getSelectedAppointments(),
				oModel = this.getModel(),
				sForemanID,
				oBC,
				sSuccessMsg = this.getResourceBundle().getText("foremanAssignmentSuccess");

			if (bSelected && aSelectedTaskIDs) {
				sForemanID = oSelectedItem.getBindingContext().getProperty("ID");
				for (var i = 0; i < aSelectedTaskIDs.length; i++) {
					//oModel.setProperty("supervisor_ID", sForemanID, this.byId(aSelectedTaskIDs[i]).getBindingContext()); // not working
					oBC = sap.ui.getCore().byId(aSelectedTaskIDs[i]).getBindingContext();
					oModel.setProperty("supervisor_ID", sForemanID, oBC);
					if (this.getModel("stateModel").getProperty("/commitAtForemanSelect") && oBC.getProperty("status") === 0) {
						oModel.setProperty("status", 1, oBC);
					}
				}
				oModel.submitChanges({
					success: function (oData) {
						MessageToast.show(sSuccessMsg);
					},
					error: function (oError) {
						Log.error("Error assigning foreman: " + JSON.stringify(oError));
					}
				});
				this.oAddForemanDialog.close();
			}
		},

		handleProfessionChange: function (oEvent) {
			this._filterForemanList();
		},

		onForemanSearch: function (oEvent) {
			this._filterForemanList();
		},

		onAddForemanListUpdateFinished: function (oEvent) {
			var oFrag = sap.ui.core.Fragment,
				oList = oFrag.byId("addForemanFrag", "addForemanList"),
				sTitle,
				iTotalItems = oEvent.getParameter("total"),
				oViewModel = this.getModel("stateModel");

			// only update the counter if the length is final
			if (oList.getBinding("items").isLengthFinal()) {
				if (iTotalItems) {
					sTitle = this.getResourceBundle().getText("addForemanListTitle", [iTotalItems]);
				} else {
					sTitle = this.getResourceBundle().getText("addForemanListTitleEmpty");
				}
				oViewModel.setProperty("/addForemanListTitle", sTitle);
			}
			this.getModel("stateModel").setProperty("/busy", false);
		},

		onOpenClashes: function () {
			var bReplace = !Device.system.phone;
			this.getModel("appView").setProperty("/layout", "ThreeColumnsEndExpanded");
			this.getRouter().navTo("Clashes", bReplace);
		},

		////////////////////// Helper Functions ///////////////////////////		

		_createViewModel: function () {
			return new JSONModel({
				busy: false,
				delay: 0,
				sortBy: "code",
				groupBy: "None",
				mode: "None",
				startDate: new Date(),
				endDate: "",
				selectedLocationID: "",
				selectedTaskID: "",
				selectedTaskPath: "",
				tasksMultiSelected: false,
				noOfSelectedTasks: 0,
				tasksToCopy: [],
				addForemanListTitle: "",
				commitAtForemanSelect: true,
				filterSelectLoaded: false,
				propagateTaskName: "",
				propagateStartDate: new Date()
			});
		},

		/**
		 * Internal helper method to apply both filter and search state together on the recipe list binding
		 * @private
		 */
		_applyFilterSearch: function () {
			var aFilters = this._oListFilterState.aSearch.concat(this._oListFilterState.aFilter),
				oStateModel = this.getModel("stateModel");
			this._oList.getBinding("items").filter(aFilters, "Application");
			// changes the noDataText of the list in case there are no filter results
			if (aFilters.length !== 0) {
				oStateModel.setProperty("/noRecipeDataText", this.getResourceBundle().getText("recipeMasterListNoDataWithFilterOrSearchText"));
			} else if (this._oListFilterState.aSearch.length > 0) {
				// only reset the no data text to default when no new search was triggered
				oStateModel.setProperty("/noRecipeDataText", this.getResourceBundle().getText("recipeMasterListNoDataText"));
			}
		},
		/*
				onRecipeDragStart: function (oEvent) {
					var oRecipe = oEvent.getSource();
				},
		*/
		/*		onDropRecipe: function (oEvent) {
					var oPC = oEvent.getSource();
					var oStartDate = oEvent.getParameter("startDate");
					var oEndDate = oEvent.getParameter("endDate");
				},
		*/
		handleRowSelectionChange: function (oEvent) {
			var oPC = oEvent.getSource(),
				aRows = oPC.getRows(),
				aAppointments = [],
				i, j,
				bSelect;

			for (i = 0; i < aRows.length; i++) {
				aAppointments = aRows[i].getAppointments();
				bSelect = aRows[i].getSelected(); // select or deselect all tasks in the row
				for (j = 0; j < aAppointments.length; j++) {
					aAppointments[j].setSelected(bSelect);
				}
			}
			this._setModelsBasedOnSelections();
		},

		_setModelsBasedOnSelections: function (oRow, oNextStartDate, oNextEndDate) {
			var oPC = this.byId("planningBoard"),
				aSelectedRows = oPC.getSelectedRows(),
				aSelectedTaskIDs = oPC.getSelectedAppointments(),
				iSelectedRows = aSelectedRows.length,
				iSelectedTasks = aSelectedTaskIDs.length,
				oAppModel = this.getModel("appView");

			// Row selections
			if (iSelectedRows === 1) { // if only one row is selected, preselect it as current location
				oAppModel.setProperty("/activeRowID", aSelectedRows[0].getBindingContext().getProperty("ID"));
				oAppModel.setProperty("/activeRowCode", aSelectedRows[0].getBindingContext().getProperty("code"));
				oAppModel.setProperty("/activeRowText", aSelectedRows[0].getTitle() + " - " + aSelectedRows[0].getText());
				this.byId("addButton").setEnabled(true);
			} else {
				if (oRow) { // values come from intervalSelect or appointmentSelect
					oAppModel.setProperty("/activeRowID", oRow.getBindingContext().getProperty("ID"));
					oAppModel.setProperty("/activeRowCode", oRow.getBindingContext().getProperty("code"));
					oAppModel.setProperty("/activeRowText", oRow.getTitle() + " - " + oRow.getText());
					oAppModel.setProperty("/activeStartDate", oNextStartDate);
					oAppModel.setProperty("/activeEndDate", oNextEndDate);
					this.byId("addButton").setEnabled(true);
				} else {
					oAppModel.setProperty("/activeRowID", "");
					oAppModel.setProperty("/activeRowCode", "");
					oAppModel.setProperty("/activeRowText", "");
					oAppModel.setProperty("/activeStartDate", "");
					this.getModel("stateModel").setProperty("/mode", "None"); // deselect copy mode
					this.byId("addButton").setEnabled(false);
				}
			}
			// Task selections
			this.getModel("stateModel").setProperty("/noOfSelectedTasks", iSelectedTasks);
			if (iSelectedTasks === 1) { // if only one task is selected, set the stateModel plus the appView
				var //oSelectedTask = this.byId(aSelectedTaskIDs[0]), // not working as no local (stable) ID can be used
					oSelectedTask = sap.ui.getCore().byId(aSelectedTaskIDs[0]),
					oSelectedRow = oSelectedTask.getParent();
				this.getModel("stateModel").setProperty("/selectedTaskID", oSelectedTask.getBindingContext().getObject().ID);
				this.getModel("stateModel").setProperty("/selectedTaskPath", oSelectedTask.getBindingContext().getPath());
				this.getModel("stateModel").setProperty("/tasksMultiSelected", false);
				if (this.getModel("stateModel").getProperty("/mode") !== "Copy") { // in paste mode don't select rows from selected task
					oAppModel.setProperty("/activeStartDate", oSelectedTask.getEndDate());
					oAppModel.setProperty("/activeRowID", oSelectedRow.getBindingContext().getProperty("ID"));
					oAppModel.setProperty("/activeRowCode", oSelectedRow.getBindingContext().getProperty("code"));
					oAppModel.setProperty("/activeRowText", oSelectedRow.getTitle() + " - " + oSelectedRow.getText());
				}
				this.byId("addButton").setEnabled(true);
			} else {
				//this.getModel("stateModel").setProperty("/selectedTaskID", "");
				this.getModel("stateModel").setProperty("/selectedTaskPath", "");
				this.getModel("stateModel").setProperty("/tasksMultiSelected", iSelectedTasks > 1);
			}
			// if there was a three column layout and the user selected now more than one task the third column would display wrong information
			if (iSelectedTasks > 1 && (oAppModel.getProperty("/layout") === "ThreeColumnsMidExpanded" || oAppModel.getProperty("/layout") ===
					"ThreeColumnsEndExpanded")) {
				oAppModel.setProperty("/layout", "TwoColumnsMidExpanded");
			}
		},

		_clearModelsOfSelections: function () {
			this.getModel("stateModel").setProperty("/noOfSelectedTasks", 0);
			this.getModel("stateModel").setProperty("/tasksMultiSelected", false);
			this.getModel("stateModel").setProperty("/selectedLocationID", "");
			this.getModel("stateModel").setProperty("/selectedTaskID", "");
			this.getModel("stateModel").setProperty("/selectedTaskPath", "");
			this.getModel("appView").setProperty("/selectedTaskIDs", []);
			this.getModel("appView").setProperty("/selectedTaskControlIDs", []);
		},

		_loadFilterSelectValues: function () {
			var oModel = this.getModel(),
				sProjectID = this.getModel("appView").getProperty("/selectedProjectID"),
				oProjectFilter = new Filter("project_ID", FilterOperator.EQ, sProjectID),
				oWorkerFiler = new Filter("deployment/project_ID", FilterOperator.EQ, sProjectID);

			oModel.read("/Disciplines", {
				error: function (oError) {
					Log.error("Error reading disciplines: " + JSON.stringify(oError));
				}
			});
			oModel.read("/Crews", {
				filters: [oProjectFilter],
				error: function (oError) {
					Log.error("Error reading disciplines: " + JSON.stringify(oError));
				}
			});
			oModel.read("/Persons", {
				filters: [oWorkerFiler],
				urlParameters: {
					$expand: "profession, profession/discipline, experience, deployment"
				},
				error: function (oError) {
					Log.error("Error reading disciplines: " + JSON.stringify(oError));
				}
			});
			oModel.read("/CompaniesForProjects", {
				filters: [oProjectFilter],
				urlParameters: {
					$expand: "company, discipline"
				},
				error: function (oError) {
					Log.error("Error reading disciplines: " + JSON.stringify(oError));
				}
			});
		},

		///old generated code

		/* =========================================================== */
		/* event handlers                                              */
		/* =========================================================== */

		/**
		 * Event handler when the share by E-Mail button has been clicked
		 * @public
		 */
		onSendEmailPress: function () {
			var oViewModel = this.getModel("detailView");

			URLHelper.triggerEmail(
				null,
				oViewModel.getProperty("/shareSendEmailSubject"),
				oViewModel.getProperty("/shareSendEmailMessage")
			);
		},

		/**
		 * Event handler when the share in JAM button has been clicked
		 * @public
		 */
		onShareInJamPress: function () {
			var oViewModel = this.getModel("detailView"),
				oShareDialog = sap.ui.getCore().createComponent({
					name: "sap.collaboration.components.fiori.sharing.dialog",
					settings: {
						object: {
							id: location.href,
							share: oViewModel.getProperty("/shareOnJamTitle")
						}
					}
				});

			oShareDialog.open();
		},

		/* =========================================================== */
		/* begin: internal methods                                     */
		/* =========================================================== */

		/**
		 * Set the full screen mode to false and navigate to master page
		 */
		onCloseDetailPress: function () {
			this.getModel("appView").setProperty("/actionButtonsInfo/midColumn/fullScreen", false);
			this.getModel("appView").setProperty("/layout", "OneColumn");
			// No item should be selected on master after detail page is closed
			this.getOwnerComponent().oListSelector.clearMasterListSelection();
			this.getModel("appView").setProperty("/selectedRowIDs", 0);
			this.getRouter().navTo("master");
		},

		/**
		 * Toggle between full and non full screen mode.
		 */
		toggleFullScreen: function () {
			var bFullScreen = this.getModel("appView").getProperty("/actionButtonsInfo/midColumn/fullScreen");
			this.getModel("appView").setProperty("/actionButtonsInfo/midColumn/fullScreen", !bFullScreen);
			if (!bFullScreen) {
				// store current layout and go full screen
				this.getModel("appView").setProperty("/previousLayout", this.getModel("appView").getProperty("/layout"));
				this.getModel("appView").setProperty("/layout", "MidColumnFullScreen");
			} else {
				// reset to previous layout
				this.getModel("appView").setProperty("/layout", this.getModel("appView").getProperty("/previousLayout"));
			}
		}
	});

});
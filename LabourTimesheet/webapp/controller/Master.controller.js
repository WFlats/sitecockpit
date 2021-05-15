sap.ui.define([
	"./BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/ui/core/routing/History",
	"sap/ui/model/Filter",
	"sap/ui/model/Sorter",
	"sap/ui/model/FilterOperator",
	"sap/m/GroupHeaderListItem",
	"sap/ui/core/SeparatorItem",
	"sap/m/MessageBox",
	"sap/m/MessageToast",
	"sap/ui/Device",
	"sap/m/Dialog",
	"sap/base/Log",
	"sap/ui/core/Fragment",
	"../model/formatter"
], function (BaseController, JSONModel, History, Filter, Sorter, FilterOperator, GroupHeaderListItem, SeparatorItem, MessageBox,
	MessageToast, Device,
	Dialog, Log, Fragment, formatter) {
	"use strict";

	return BaseController.extend("labour.timesheet.LabourTimesheet.controller.Master", {

		formatter: formatter,

		/* =========================================================== */
		/* lifecycle methods                                           */
		/* =========================================================== */

		/**
		 * Called when the master list controller is instantiated. It sets up the event handling for the master/detail communication and other lifecycle tasks.
		 * @public
		 */
		onInit: function () {
			// Control state model
			var oList = this.byId("list"),
				oViewModel = this._createViewModel(),
				// Put down master list's original value for busy indicator delay,
				// so it can be restored later on. Busy handling on the master list is
				// taken care of by the master list itself.
				iOriginalBusyDelay = oList.getBusyIndicatorDelay();

			this._oList = oList;
			// keeps the filter and search state
			this._oListFilterState = {
				aFilter: [],
				aSearch: []
			};

			this.setModel(oViewModel, "masterView");
			// set the companyModel here
			var oCompanyModel = new JSONModel();
			oCompanyModel.setData({
				companies: []
			});
			this.setModel(oCompanyModel, "companyModel");
			// Make sure, busy indication is showing immediately so there is no
			// break after the busy indication for loading the view's meta data is
			// ended (see promise 'oWhenMetadataIsLoaded' in AppController)
			oList.attachEventOnce("updateFinished", function () {
				// Restore original busy indicator delay for the list
				oViewModel.setProperty("/delay", iOriginalBusyDelay);
			});

			this.getView().addEventDelegate({
				onBeforeFirstShow: function () {
					this.getOwnerComponent().oListSelector.setBoundMasterList(oList);
				}.bind(this)
			});

			this.getRouter().getRoute("master").attachPatternMatched(this._onMasterMatched, this);
			this.getRouter().attachBypassed(this.onBypassed, this);

			// find to which project(s) the user has access
			// if more than one, let the user select
			var oModel = this.getOwnerComponent().getModel(),
				oAppView = this.getModel("appView"),
				that = this;
			oModel.metadataLoaded().then(function () {
				oModel.read("/Projects", {
					success: function (oData) {
						if (oData && oData.results.length > 0) {
							if (oData.results.length === 1) {
								oAppView.setProperty("/selectedProjectID", oData.results[0].ID);
								that.setProjectBC(oData.results[0].ID);
								that.loadWorkTimeModel();
							} else {
								that.selectProject(); // sets bidingContext, appView, workTimeModel
							}
						} else {
							MessageBox.Alert("You have no access rights to projects!");
						}
					},
					error: function (oResult) {
						MessageBox.Alert("Error accessing projects: " + oResult.statusCode + " - " + oResult.statusText);
					}
				});
			});
		},

		/////////////// Select Project /////////////////////////

		setProjectBC: function (sID) {
			var oModel = this.getModel(),
				sTitle = this.getResourceBundle().getText("timeSheetTitle"),
				sPath = "/" + oModel.createKey("Projects", {
					ID: sID
				}),
				oProjectBC = oModel.createBindingContext(sPath),
				sProjectCode = oProjectBC.getProperty("code");

			this.getUserInfo("LabourTimesheet", "Timekeeper", sProjectCode);

			this._oListFilterState.aFilter = [new Filter("deployment/project_ID", FilterOperator.EQ, sID)];
			this._applyFilterSearch();

			// set the project as title
			sTitle += " " + oProjectBC.getProperty("code") + " - " + oProjectBC.getProperty("description");
			this.getModel("masterView").setProperty("/title", sTitle);
		},

		selectProject: function () {
			this._createProjectSelectionDialog();
			this.projectSelectionDialog.open();
		},

		_createProjectSelectionDialog: function () {
			var sTitle = this.getResourceBundle().getText("selectProjectDialogTitle");

			if (!this.projectSelectionDialog) {
				this.projectSelectionDialog = new Dialog({
					title: sTitle,
					contentWidth: "50%",
					resizable: true,
					draggable: true,
					content: [
						sap.ui.xmlfragment("projectSelectFrag", "labour.timesheet.LabourTimesheet.view.SelectProject", this)
					]
				});
				this.projectSelectionDialog.addStyleClass("sapUiContentPadding");
				this.getView().addDependent(this.projectSelectionDialog);
			}
		},

		onProjectSelected: function (oEvent) {
			var sProjectID = oEvent.getParameter("listItem").getBindingContext().getProperty("ID");

			this.projectSelectionDialog.close();
			this.getModel("appView").setProperty("/selectedProjectID", sProjectID);
			this.setProjectBC(sProjectID);
			this.loadWorkTimeModel();
		},

		onProjectListUpdateFinished: function (oEvent) {
			var oFrag = sap.ui.core.Fragment,
				oList = oFrag.byId("projectSelectFrag", "projectsTable"),
				sTitle,
				iTotalItems = oEvent.getParameter("total"),
				oViewModel = this.getModel("masterView");

			// only update the counter if the length is final
			if (oList.getBinding("items").isLengthFinal()) {
				if (iTotalItems) {
					sTitle = this.getResourceBundle().getText("selectProjectTitle", [iTotalItems]);
				} else {
					sTitle = this.getResourceBundle().getText("selectProjectTitleEmpty");
				}
				oViewModel.setProperty("/selectProjectTitle", sTitle);
			}
		},

		/* =========================================================== */
		/* event handlers                                              */
		/* =========================================================== */

		onToggleGenerateMode: function (oEvent) {
			var oPersonList = this.byId("list"),
				aPersons = oPersonList.getItems();
			if (oEvent.getParameter("pressed")) {
				oPersonList.setMode("MultiSelect");
				this.byId("generateButton").setIcon("sap-icon://show-edit");
				aPersons.forEach(function (oPerson) {
					oPerson.setType("Inactive");
				});
				this.getModel("appView").setProperty("/layout", "OneColumn");
			} else {
				oPersonList.setMode("None");
				this.byId("generateButton").setIcon("sap-icon://generate-shortcut");
				aPersons.forEach(function (oPerson) {
					oPerson.setType("Navigation");
					oPersonList.setSelectedItem(oPerson, false);
				});
			}
		},

		onToggleMultiSelect: function (oEvent) {
			var oPersonList = this.byId("list"),
				aPersons = oPersonList.getItems();
			if (oEvent.getParameter("pressed")) {
				this.byId("selectAllNoneButton").setIcon("sap-icon://multiselect-none");
				aPersons.forEach(function (oPerson) {
					oPersonList.setSelectedItem(oPerson, true);
				});
			} else {
				this.byId("selectAllNoneButton").setIcon("sap-icon://multiselect-all");
				aPersons.forEach(function (oPerson) {
					oPersonList.setSelectedItem(oPerson, false);
				});
			}
		},

		onGenerate: function () {
			var aPersons = this.byId("list").getSelectedItems(),
				oDate = this.getModel("appView").getProperty("/selectedDate"),
				oPersonList = this.byId("list"),
				aShifts = this.getModel("workTimeModel").getProperty("/shifts"),
				oShiftEndOfDay = new Date(oDate.getTime()),
				sConfirmText = this.getResourceBundle().getText("notEndOfShiftMsg"),
				sConfirmTitle = this.getResourceBundle().getText("confirmTitle"),
				that = this;
			// find last shift end on oDate
			oShiftEndOfDay = this.getEndOfLastShiftOnADay(aShifts, oDate);
			if (!oShiftEndOfDay) {
				MessageToast.show(this.getResourceBundle().getText("toastNoShiftOnDate"));
				return;
			}

			if (aPersons.length === 0) {
				MessageToast.show(this.getResourceBundle().getText("toastNoPersonSelected"));
				return;
			}
			// check if shifts ended
			if (Date.now() < oShiftEndOfDay.getTime()) {
				MessageBox.confirm(sConfirmText, {
					icon: MessageBox.Icon.WARNING,
					title: sConfirmTitle,
					actions: [sap.m.MessageBox.Action.YES, sap.m.MessageBox.Action.NO],
					initialFocus: MessageBox.Action.NO,
					onClose: function (sAction) {
						if (sAction === "NO") {
							return;
						} else {
							that._getTasksOfDay(oDate).then(function (aTasksOfDay) {
								if (aTasksOfDay && aTasksOfDay.length > 0) {
									that._generateTimeSheets(aPersons, aTasksOfDay, oDate).then(function () {
										that.getModel("masterView").setProperty("/busy", false);
									});
								}
							});
							that.getModel("masterView").setProperty("/generateMode", false);
							oPersonList.setMode("None");
							that.byId("generateButton").setIcon("sap-icon://generate-shortcut");
							aPersons.forEach(function (oPerson) {
								oPerson.setType("Navigation");
								oPersonList.setSelectedItem(oPerson, false);
							});
						}
					}
				});
			} else {
				that._getTasksOfDay(oDate).then(function (aTasksOfDay) {
					if (aTasksOfDay && aTasksOfDay.length > 0) {
						that._generateTimeSheets(aPersons, aTasksOfDay, oDate).then(function () {
							that.getModel("masterView").setProperty("/busy", false);
						});
					}
				});
				that.getModel("masterView").setProperty("/generateMode", false);
				oPersonList.setMode("None");
				that.byId("generateButton").setIcon("sap-icon://generate-shortcut");
				aPersons.forEach(function (oPerson) {
					oPerson.setType("Navigation");
					oPersonList.setSelectedItem(oPerson, false);
				});
			}
		},

		_getTasksOfDay: function (oDate) {
			var oProjectFilter = new Filter("project_ID", FilterOperator.EQ, this.getModel("appView").getProperty("/selectedProjectID")),
				oTaskStatusFilter = new Filter("status", FilterOperator.GT, 1),
				oDayStart,
				oDayEnd,
				oOverlapFilter1,
				oOverlapFilter2,
				oModel = this.getModel(),
				that = this;

			oDayStart = new Date(oDate.getTime());
			oDayStart.setHours(0, 0, 0, 0);
			oDayEnd = new Date(oDate.getTime());
			oDayEnd.setHours(23, 59, 59, 999);
			oOverlapFilter1 = new Filter("actualStart", FilterOperator.LT, oDayEnd);
			oOverlapFilter2 = new Filter("estimatedEnd", FilterOperator.GT, oDayStart);
			// find the tasks of the day, expand workers/crews and fill the oModel to have access when looping through all workers
			return new Promise(function (resolve, reject) {
				oModel.read("/Tasks", {
					filters: [
						oProjectFilter, // selected project
						oTaskStatusFilter, // status > 1
						oOverlapFilter1, // task must overlap with oDate
						oOverlapFilter2
					],
					and: true,
					urlParameters: {
						$expand: "workers, crews"
					},
					success: function (oData) {
						if (oData.results.length > 0) {
							resolve(oData.results);
						} else {
							MessageToast.show(that.getResourceBundle().getText("noTasksWorked") + " " + oDate.toLocaleDateString());
							resolve(oData);
						}
					},
					error: function (oError) {
						Log.error(that.getResourceBundle().getText("errorReadingTasksOnADay") + " " + oDate.toLocaleDateString() + ":" + JSON.stringify(
							oError));
						reject();
					}
				});
			});
		},

		_getTasksWorked: function (oPerson, aTasksOfDay) {
			var oModel = this.getModel(),
				sPersonCrewID = oPerson.getBindingContext().getProperty("memberOfCrew_ID"),
				sPersonID = oPerson.getBindingContext().getProperty("ID"),
				aTasksWorked = [],
				sPath;

			if (sPersonCrewID) { // member of crew
				aTasksOfDay.forEach(function (oTask) {
					sPath = "/" + oModel.createKey("Tasks", {
						ID: oTask.ID
					});
					var aCrewsPaths = oModel.createBindingContext(sPath).getProperty("crews");
					aCrewsPaths.forEach(function (sCrewsPath) {
						if (sPersonCrewID === oModel.createBindingContext("/" + sCrewsPath).getProperty("crew_ID")) {
							aTasksWorked.push(oTask);
						}
					});
				});
			} else { // check if assigned as a worker
				aTasksOfDay.forEach(function (oTask) {
					sPath = "/" + oModel.createKey("Tasks", {
						ID: oTask.ID
					});
					var aWorkersPaths = oModel.createBindingContext(sPath).getProperty("workers");
					aWorkersPaths.forEach(function (sWorkerPath) {
						if (sPersonID === oModel.createBindingContext("/" + sWorkerPath).getProperty("worker_ID")) {
							aTasksWorked.push(oTask);
						}
					});
				});
			}
			return aTasksWorked;
		},

		_generateTimeSheets: function (aPersons, aTasksOfDay, oDate) {
			var oModel = this.getModel(),
				sProjectID = this.getModel("appView").getProperty("/selectedProjectID"),
				iCount = 0,
				mTimesheetTotalHoursWorked = 0,
				mTimesheetTotalCostWorked = 0,
				tasksOverlap = function (aTasks) {
					var bOverlap = false;
					for (var n = 0; n < aTasks.length - 1; n++) {
						//if (oTaskStart.getTime() < oEnd.getTime() && oStart.getTime() < oTaskEnd.getTime())
						if (aTasks[n].actualStart.getTime() < aTasks[n + 1].estimatedEnd.getTime() &&
							aTasks[n + 1].actualStart.getTime() < aTasks[n].estimatedEnd.getTime()) {
							bOverlap = true;
							break;
						}
					}
					return bOverlap;
				},
				that = this;

			that.getModel("masterView").setProperty("/busy", true);
			return new Promise(function (resol) {
				aPersons.reduce(function (p, oPerson, i) {
					new Promise(function (resolve, reject) {
						// find tasks the person worked on
						var aTasksWorked = that._getTasksWorked(oPerson, aTasksOfDay);
						// create timesheet entries
						if (aTasksWorked.length > 0) {
							if (aTasksWorked.findIndex(function (v, j, a) {
									return v.shift_ID !== a[0].shift_ID; // check if all tasks are in the same shift
								}) >= 0) {
								MessageBox.error(that.getResourceBundle().getText("tasksInDifferentShiftsError"));
								that.getModel("masterView").setProperty("/busy", false);
							} else if (tasksOverlap(aTasksWorked)) {
								MessageBox.error(that.getResourceBundle().getText("tasksOverlappingError"));
								that.getModel("masterView").setProperty("/busy", false);
							} else { // all fine, create timesheet and then entries
								var oTimesheet = {
									project_ID: sProjectID,
									person_ID: oPerson.getBindingContext().getProperty("ID"),
									workingDate: oDate
								};
								oModel.create("/Timesheets", oTimesheet, {
									success: function (oData) { // create timesheet entries
										if (oData) {
											aTasksWorked.reduce(function (q, oTaskWorked, k) {
												new Promise(function (reso, reje) {
													var aShiftPartsWorked = that.getShiftPartsAndValuesOnADay(oTaskWorked, oDate); // must exist
													aShiftPartsWorked.reduce(function (r, oShiftPart, l) {
														new Promise(function (res, rej) {
															var oTimeSheetEntry = {},
																mRate = oPerson.getBindingContext().getProperty("wageClass/rate");
															oTimeSheetEntry.project_ID = sProjectID;
															oTimeSheetEntry.person_ID = oPerson.getBindingContext().getProperty("ID");
															oTimeSheetEntry.task_ID = oTaskWorked.ID;
															oTimeSheetEntry.timesheet_ID = oData.ID;
															oTimeSheetEntry.shiftPart_ID = oShiftPart.shiftPartID;
															oTimeSheetEntry.workingDate = oDate;
															oTimeSheetEntry.startTimeHrs = oShiftPart.startTimeHours;
															oTimeSheetEntry.startTimeMins = oShiftPart.startTimeMinutes;
															oTimeSheetEntry.endTimeHrs = oShiftPart.endTimeHours;
															oTimeSheetEntry.endTimeMins = oShiftPart.endTimeMinutes;
															oTimeSheetEntry.hoursWorked = parseFloat(that.getDecimalHours(oShiftPart.endTimeHours, oShiftPart.endTimeMinutes) -
																that.getDecimalHours(oShiftPart.startTimeHours, oShiftPart.startTimeMinutes)).toFixed(3);
															oTimeSheetEntry.rate = parseFloat(mRate * (1 + oShiftPart.wageIncrease * 0.01)).toFixed(3);
															oTimeSheetEntry.calculatedCost = parseFloat(oTimeSheetEntry.hoursWorked * oTimeSheetEntry.rate).toFixed(
																3);
															that.getModel("masterView").setProperty("/busy", true);
															iCount += 1;
															oModel.create("/TimeSheetEntries", oTimeSheetEntry, {
																success: function (oTimeSheetEntryCreated) {
																	mTimesheetTotalHoursWorked += Number(oTimeSheetEntryCreated.hoursWorked);
																	mTimesheetTotalCostWorked += Number(oTimeSheetEntryCreated.calculatedCost);
																	MessageToast.show(that.getResourceBundle().getText("timesheetSuccessMessage", [iCount]));
																	// when the last timesheet entry of the last task worked was created then update the timesheet with totals
																	if (k === aTasksWorked.length - 1 && l === aShiftPartsWorked.length - 1) {
																		that._updateTimesheet(oData.ID, oTaskWorked.shift_ID, oPerson, mTimesheetTotalHoursWorked,
																			mTimesheetTotalCostWorked);
																	}
																	that.getModel("masterView").setProperty("/busy", false);
																},
																error: function (oError) {
																	Log.error("Error creating timesheets: " + JSON.stringify(oError));
																	that.getModel("masterView").setProperty("/busy", false);
																}
															});
														});
													}, Promise.resolve());
												});
											}, Promise.resolve());
										}
									},
									error: function (oError) {
										Log.error("Error creating timesheet");
									}
								});
							}
						} else {
							that.getModel("masterView").setProperty("/busy", false);
						}
					});
				}, Promise.resolve());
			});
		},

		_updateTimesheet: function (sTimesheetID, sShiftID, oPerson, mTotalHours, mTotalCost) {
			// called after timesheet entries were created; updates totals in timesheet
			var oModel = this.getModel(),
				sTimesheetPath = "/" + oModel.createKey("Timesheets", {
					ID: sTimesheetID
				}),
				oTimesheet = oModel.createBindingContext(sTimesheetPath).getObject({
					select: "*"
				});

			oTimesheet.hoursWorked = parseFloat(mTotalHours).toFixed(3);
			oTimesheet.hoursShift = this.getWorkingHoursOfShift(sShiftID);
			oTimesheet.costWorking = parseFloat(mTotalCost).toFixed(3);
			oTimesheet.costShift = this.getCostOfShift(oPerson, sShiftID);
			oModel.update(sTimesheetPath, oTimesheet, {
				error: function (oError) {
					Log.error("Error updating timesheet with time and cost totals");
				}
			});
		},

		_updateTasksWithActualLaborCost: function (aTasks) {
			var oModel = this.getModel();

			aTasks.reduce(function (oAgg, oTask, i) {
				Promise(function (resolve, reject) {
					var oFilter = new Filter("task_ID", FilterOperator.EQ, oTask.getBindingContext().getProperty("ID"));
					oModel.read("/TimeSheetEntries", {
						filters: [oFilter],
						success: function (oData) {
							if (oData && oData.results.length > 0) {
								var aTimesheetEntries = oData.results,
									mActualLaborCost = 0,
									mActualLaborHours = 0;
								aTimesheetEntries.forEach(function (oTimesheetEntry) {
									mActualLaborCost += oTimesheetEntry.calculatedCost;
									mActualLaborHours += oTimesheetEntry.hoursWorked;
								});
								oModel.setProperty("costLaborActual", mActualLaborCost, oTask.getBindingContext());
								oModel.setProperty("hoursLaborActual", mActualLaborHours, oTask.getBindingContext());
								oModel.submitChanges({
									error: function (oError) {
										Log.error("Error updating task with actual labor values");
									}
								});
							}
						},
						error: function (oError) {
							Log.error("Error reading tasks to update with actual labor cost");
						}
					});
				});
			}, Promise.resolve());
		},

		/**
		 * After list data is available, this handler method updates the
		 * master list counter
		 * @param {sap.ui.base.Event} oEvent the update finished event
		 * @public
		 */
		onUpdateFinished: function (oEvent) {
			// update the master list object counter after new data is loaded
			this._updateListItemCount(oEvent.getParameter("total"));
		},

		/**
		 * Event handler for the master search field. Applies current
		 * filter value and triggers a new search. If the search field's
		 * 'refresh' button has been pressed, no new search is triggered
		 * and the list binding is refresh instead.
		 * @param {sap.ui.base.Event} oEvent the search event
		 * @public
		 */
		onSearch: function (oEvent) {
			if (oEvent.getParameters().refreshButtonPressed) {
				// Search field's 'refresh' button has been pressed.
				// This is visible if you select any master list item.
				// In this case no new search is triggered, we only
				// refresh the list binding.
				this.onRefresh();
				return;
			}

			var sQuery = oEvent.getParameter("query");

			if (sQuery) {
				this._oListFilterState.aSearch = [new Filter("lastName", FilterOperator.Contains, sQuery)];
			} else {
				this._oListFilterState.aSearch = [];
			}
			this._applyFilterSearch();
		},

		onDateChanged: function (oEvent) {
			//var sDate = oEvent.getParameter("value");
			//this.getModel("appView").setProperty("/selectedDate", new Date(sDate));
			this.getRouter().navTo("master");
		},

		minusDay: function () {
			var oDate = new Date(this.getModel("appView").getProperty("/selectedDate"));
			oDate.setDate(oDate.getDate() - 1);
			this.getModel("appView").setProperty("/selectedDate", new Date(oDate));
		},

		plusDay: function () {
			var oDate = new Date(this.getModel("appView").getProperty("/selectedDate"));
			oDate.setDate(oDate.getDate() + 1);
			this.getModel("appView").setProperty("/selectedDate", new Date(oDate));
		},

		onRefresh: function () {
			this._oList.getBinding("items").refresh();
		},

		/**
		 * Event handler for the list selection event
		 * @param {sap.ui.base.Event} oEvent the list selectionChange event
		 * @public
		 */
		onSelectionChange: function (oEvent) {
			var oList = oEvent.getSource(),
				bSelected = oEvent.getParameter("selected");

			// skip navigation when deselecting an item in multi selection mode
			//if (!(oList.getMode() === "MultiSelect" && !bSelected)) { would open detail view in generate mode
			if (!(oList.getMode() === "MultiSelect")) {
				// get the list item, either from the listItem parameter or from the event's source itself (will depend on the device-dependent mode).
				this._showDetail(oEvent.getParameter("listItem") || oEvent.getSource());
			}
		},

		/**
		 * Event handler for the bypassed event, which is fired when no routing pattern matched.
		 * If there was an object selected in the master list, that selection is removed.
		 * @public
		 */
		onBypassed: function () {
			this._oList.removeSelections(true);
		},

		/**
		 * Used to create GroupHeaders with non-capitalized caption.
		 * These headers are inserted into the master list to
		 * group the master list's items.
		 * @param {Object} oGroup group whose text is to be displayed
		 * @public
		 * @returns {sap.m.GroupHeaderListItem} group header with non-capitalized caption.
		 */
		getCompany: function (oContext) {
			var oCompany = oContext.getProperty("company"),
				oGroup;
			if (oCompany) {
				oGroup = {
					key: oCompany.ID,
					companyName: oCompany.companyName
				};
			}
			return oGroup;
		},

		createGroupHeader: function (oGroup) {
			var oCompanyModel = this.getModel("companyModel"),
				aCompanies = oCompanyModel.getProperty("/companies");

			// crate the company model on the fly
			// if it is a company not yet in the model then add it
			if (aCompanies.findIndex(function (oValue) {
					return oValue.ID === oGroup.key;
				}) < 0) {
				aCompanies.push({
					ID: oGroup.key,
					companyName: oGroup.companyName
				});
				aCompanies.sort(function (a, b) {
					return a.companyName > b.companyName;
				});
				oCompanyModel.setData({
					companies: aCompanies
				});
			}

			return new GroupHeaderListItem({
				title: oGroup.companyName,
				upperCase: false
			});
		},

		/**
		 * Event handler for navigating back.
		 * It there is a history entry or an previous app-to-app navigation we go one step back in the browser history
		 * If not, it will navigate to the shell home
		 * @public
		 */
		onNavBack: function () {
			var sPreviousHash = History.getInstance().getPreviousHash(),
				oCrossAppNavigator = sap.ushell.Container.getService("CrossApplicationNavigation");

			if (sPreviousHash !== undefined || !oCrossAppNavigator.isInitialNavigation()) {
				// eslint-disable-next-line sap-no-history-manipulation
				history.go(-1);
			} else {
				oCrossAppNavigator.toExternal({
					target: {
						shellHash: "#Shell-home"
					}
				});
			}
		},

		/* =========================================================== */
		/* begin: internal methods                                     */
		/* =========================================================== */

		_createViewModel: function () {
			return new JSONModel({
				isFilterBarVisible: false,
				filterBarLabel: "",
				busy: false,
				delay: 0,
				title: "",
				timesheetTitle: "",
				noDataText: this.getResourceBundle().getText("masterListNoDataText"),
				sortBy: "company",
				groupBy: "None",
				selectProjectTitle: "",
				generateMode: false
			});
		},

		_onMasterMatched: function () {
			//Set the layout property of the FCL control to 'OneColumn'
			this.getModel("appView").setProperty("/layout", "OneColumn");
		},

		/**
		 * Shows the selected item on the detail page
		 * On phones a additional history entry is created
		 * @param {sap.m.ObjectListItem} oItem selected Item
		 * @private
		 */
		_showDetail: function (oItem) {
			var bReplace = !Device.system.phone;
			// set the layout property of FCL control to show two columns
			this.getModel("appView").setProperty("/layout", "TwoColumnsMidExpanded");
			this.getRouter().navTo("object", {
				objectId: oItem.getBindingContext().getProperty("ID")
			}, bReplace);
		},

		/**
		 * Sets the item count on the master list header
		 * @param {integer} iTotalItems the total number of items in the list
		 * @private
		 */
		_updateListItemCount: function (iTotalItems) {
			var sTitle,
				oCompanyModel = this.getModel("companyModel"),
				aCompanies = oCompanyModel.getProperty("/companies"),
				oSelect = this.byId("companySelect"),
				oItem;
			// only update the counter if the length is final
			if (this._oList.getBinding("items").isLengthFinal()) {
				sTitle = this.getResourceBundle().getText("masterTitleCount", [iTotalItems]);
				this.getModel("masterView").setProperty("/timesheetTitle", sTitle);
			}
			// set the company select content
			oSelect.destroyItems();
			for (var i = 0; i < aCompanies.length; i++) {
				oItem = new sap.ui.core.Item({
					key: aCompanies[i].ID,
					text: aCompanies[i].companyName
				});
				oSelect.addItem(oItem);
			}
		},

		loadWorkTimeModel: function () {
			var sProjectID = this.getModel("appView").getProperty("/selectedProjectID"),
				oWorkTimeModel = this.getModel("workTimeModel"),
				that = this;

			if (!oWorkTimeModel || oWorkTimeModel.getProperty("/shifts").length === 0) {
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
					that.getModel("masterView").setProperty("/busy", false);
				});
			} else {
				this.getModel("masterView").setProperty("/busy", false);
			}
		},

		/**
		 * Internal helper method to apply both filter and search state together on the list binding
		 * @private
		 */
		_applyFilterSearch: function () {
			var aFilters = this._oListFilterState.aSearch.concat(this._oListFilterState.aFilter),
				oViewModel = this.getModel("masterView");
			this._oList.getBinding("items").filter(aFilters, "Application");
			this.onRefresh();
			// changes the noDataText of the list in case there are no filter results
			if (aFilters.length > 1) { // there is always a project filter
				oViewModel.setProperty("/noDataText", this.getResourceBundle().getText("masterListNoDataWithFilterOrSearchText"));
			} else if (this._oListFilterState.aSearch.length > 0) {
				// only reset the no data text to default when no new search was triggered
				oViewModel.setProperty("/noDataText", this.getResourceBundle().getText("masterListNoDataText"));
			}
		},

		onFilterToggle: function () {
			if (!this.getModel("masterView").getProperty("/isFilterBarVisible")) {
				// clear search field
				this._oListFilterState.aSearch = [];
				this.byId("searchField").setValue("");
				// remove company filter
				this._oListFilterState.aFilter = [new Filter("deployment/project_ID", FilterOperator.EQ, this.getModel("appView").getProperty(
					"/selectedProjectID"))];
				this._applyFilterSearch();
				this.byId("companySelect").setSelectedItem(null);
			}
		},

		handleCompanyFilter: function () {
			var sCompanyID = this.byId("companySelect").getSelectedKey();

			this._oListFilterState.aFilter = [new Filter("deployment/project_ID", FilterOperator.EQ, this.getModel("appView").getProperty(
				"/selectedProjectID"))];
			if (sCompanyID) {
				this._oListFilterState.aFilter = this._oListFilterState.aFilter.concat([new Filter("company_ID", FilterOperator.EQ, sCompanyID)]);
			}
			this._applyFilterSearch();
		}

	});

});
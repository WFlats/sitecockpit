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
	"sap/ui/core/format/DateFormat",
	"cockpit/Cockpit/model/formatter"
], function (History, JSONModel, BaseController, Log, Dialog, Button, DateTime, SimpleType, MessageToast, MessageBox, Filter, DateFormat,
	formatter) {
	"use strict";

	return BaseController.extend("cockpit.Cockpit.controller.Task", {

		formatter: formatter,

		onInit: function () {
			var iOriginalBusyDelay,
				oViewModel = new JSONModel({
					busy: true,
					delay: 0,
					mode: "",
					taskID: "",
					sTaskPath: "",
					UoM: "",
					countMeasurements: 0,
					countCrews: 0,
					countWorkers: 0,
					countLabour: "",
					countQualityCards: 0,
					countProblemCards: 0,
					countHnSCards: 0,
					sMeasurementPath: "",
					sMeasurementID: "",
					selectedMeasurement: "",
					workerItemListTitle: "",
					crewItemListTitle: "",
					crewSelected: false,
					workerSelected: false,
					skillsListTitle: "",
					skillsForCrewListTitle: "",
					addCrewItemListTitle: "",
					addWorkerItemListTitle: "",
					skillFilters: undefined,
					busyWorkerFilters: undefined,
					busyCrewFilters: undefined,
					addForemanListTitle: "",
					commitAtForemanSelect: true,
					measurementItemListTitle: "",
					qualityItemListTitle: "",
					problemItemListTitle: "",
					HnSItemListTitle: "",
					qualityID: "",
					problemID: "",
					currentQuantity: "",
					currentDuration: "",
					previousQuantity: "",
					previousDuration: "",
					nextQuantity: "",
					nextDuration: "",
					cumulativeQuantity: "",
					plannedLabourHours: "0",
					actualLabourHours: "0",
					plannedLabourCost: String(0.00),
					actualLabourCost: String(0.00),
					currency: "",
					crewClashTitle: "",
					workerClashTitle: ""
				});

			this.getRouter().getRoute("Task").attachPatternMatched(this._onObjectMatched, this);

			// Store original busy indicator delay, so it can be restored later on
			iOriginalBusyDelay = this.getView().getBusyIndicatorDelay();
			this.setModel(oViewModel, "taskView");

			this.getOwnerComponent().getModel().metadataLoaded().then(function () {
				// Restore original busy indicator delay for the object view
				oViewModel.setProperty("/delay", iOriginalBusyDelay);
			});
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
				var oViewModel = this.getModel("taskView");
				oViewModel.setProperty("/taskID", sObjectId);
				oViewModel.setProperty("/sTaskPath", sObjectPath);
			}.bind(this));
		},

		_bindView: function (sObjectPath) {
			var oViewModel = this.getModel("taskView"),
				addMeasurementButton = this.byId("addMeasurementButton"),
				oStopDuration = this.byId("actualStopDuration"),
				oEstimatedEnd = this.byId("estimatedEnd"),
				oDateFormat = DateFormat.getDateTimeInstance({
					format: "yMdhm"
				}),
				oModel = this.getModel(),
				sProjectID = this.getModel("appView").getProperty("/selectedProjectID"),
				sProjectPath = "/" + oModel.createKey("Projects", {
					ID: sProjectID
				}),
				sCurrencyCode = oModel.createBindingContext(sProjectPath).getProperty("currency_code"),
				oCrewsList = this.byId("taskCrewsList"),
				oWorkersList = this.byId("taskWorkersList"),
				aSubFilter,
				oWorkforceClashModel = this.getModel("workforceClashModel"),
				that = this;

			oViewModel.setProperty("/currency", sCurrencyCode);
			this.getView().bindElement({
				path: sObjectPath,
				events: {
					change: function () {
						oViewModel.setProperty("/busy", false);
						var oTask = oModel.getObject(sObjectPath, {
								select: "*"
							}),
							oShift,
							oNow = new Date(),
							oPlannedLabourValues,
							oActualLabourValues,
							sStopDuration;
						if (oTask.status > 1) {
							if (oTask.actualStart > oNow) {
								// task started in the future; disable add measurement button
								addMeasurementButton.setEnabled(false);
							} else {
								addMeasurementButton.setEnabled(true);
							}
						}
						if (oTask.status === 3) {
							// task is stopped - calculate stop duration until now,
							// calculate new estimated end and display both (db change only when status is changed)
							sStopDuration = formatter.stopDurationTillNow(oTask.stopDuration, oTask.stoppedAt, oTask.status);
							oStopDuration.setText(sStopDuration);
							oShift = that.getShiftFromID(oTask.shift_ID);
							// estimatedEnd is calculated with remaining quantity
							oTask.estimatedEnd = that.getEndDateInWorkingHours(oNow, that.getRemainingQuantityAtStopTime(oTask), oTask.currentProductivity,
								oShift);
							oEstimatedEnd.setText(oDateFormat.format(oTask.estimatedEnd, false));
						}
						// crew and worker lists are not refreshing after new assignments
						oCrewsList.getBinding("items").refresh();
						oWorkersList.getBinding("items").refresh();
						// doesn't work in the view
						if (oTask.status > 3) { // completed or approved
							that.byId("editQuantsDates").setEnabled(false);
						} else {
							that.byId("editQuantsDates").setEnabled(true);
						}
						oViewModel.setProperty("/UoM", oModel.createBindingContext(sObjectPath).getProperty("UoM/code"));
						// set labour values
						that._setLaborModel();
						// initialise clash model
						oWorkforceClashModel.setData({
							overlappingTasksOfCrews: [],
							overlappingTasksOfWorkers: []
						});
					},
					dataRequested: function () {
						oViewModel.setProperty("/busy", true);
					},
					dataReceived: function (oData) {
						oViewModel.setProperty("/busy", false);
					}
				}
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

		////////////////////////////////////////////////////////STATUS////////////////////////////////////

		onTaskStatePress: function () {
			var oModel = this.getModel(),
				oViewModel = this.getModel("taskView"),
				sConfirmTitle = this.getResourceBundle().getText("confirmStatusChangeTitle"),
				sConfirmText = "",
				sPath = oViewModel.getProperty("/sTaskPath"),
				oTask = oModel.getObject(sPath, {
					select: "*"
				}),
				oShift = this.getShiftFromID(oTask.shift_ID);
			switch (oTask.status) {
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
			// increment status
			if (oTask.status === 2) {
				oTask.status = 4; // jump over "stopped", set to completed
			} else {
				oTask.status += 1;
				if (oTask.status > 5) { // shouldn't happen as button is disabled if (status === 5)
					oTask.status = 5;
				}
			}
			sConfirmTitle = this.getResourceBundle().getText("confirmStatusChangeTitle");
			sConfirmText = this.getResourceBundle().getText("confirmStatusChangeText") + " " + sConfirmText + "?";
			var that = this;
			MessageBox.confirm(
				sConfirmText, {
					icon: MessageBox.Icon.WARNING,
					title: sConfirmTitle,
					actions: [sap.m.MessageBox.Action.OK, sap.m.MessageBox.Action.CANCEL],
					initialFocus: MessageBox.Action.CANCEL,
					onClose: function (sAction) {
						if (sAction === "OK") {
							// actions on new status
							if (oTask.status === 2) { // started for the first time
								oTask.actualStart = new Date();
								oTask.actualStart = that.getStartDateInWorkingHours(oTask.actualStart, oShift);
								oTask.estimatedEnd = that.getEndDateInWorkingHours(oTask.actualStart, oTask.quantity, oTask.plannedProductivity * oTask.productivityFactor,
									oShift);
							} else if (oTask.status === 4) { // completed; no shift to working hours
								oTask.estimatedEnd = new Date();
								if (!that.inShift(oTask.estimatedEnd, oShift)) {
									oTask.estimatedEnd = that.getPreviousShiftEnd(oTask.estimatedEnd, oShift);
								}
								// checkAutoCompleteMeasurements creates final measurement, saves results to recipe and updates oTask
								that.checkAutoCompleteMeasurements(oTask);
								//that.createWorkerTimeSheets(oTask); // now i timesheet app
								that.onRefresh();
								return;
							} else if (oTask.status === 5) { // approved; no shift to working hours
								oTask.actualEnd = new Date();
							}
							oModel.update(sPath, oTask);
						}
					}
				}
			);
		},

		onStartStopPressed: function () {
			var oModel = this.getModel(),
				oViewModel = this.getModel("taskView"),
				sCumulativeQuantity = oViewModel.getProperty("/cumulativeQuantity"),
				sPath = oViewModel.getProperty("/sTaskPath"),
				oTask = oModel.getObject(sPath, {
					select: "*"
				}),
				oShift = this.getShiftFromID(oTask.shift_ID),
				oNow = new Date();
			// start date was already set by Status button press
			if (oTask.status === 2) { // task is being stopped
				// if oNow is not in shift, set oTask.stoppedAt to the last shift end
				if (!this.inShift(oNow, oShift)) {
					oTask.stoppedAt = this.getShiftEnd(oNow, oShift);
				} else {
					oTask.stoppedAt = oNow;
				}
				oTask.status = 3; // set to stopped
			} else if (oTask.status === 3) { // task is being re-started
				// if oNow is not in the shift, getNetDurationHoursFromDates calculates stop duration until last shift end
				// only the stop duration within working hours is stored!
				// no new measurement can be entered during stop times
				var mStopDurationHours = this.getNetDurationHoursFromDates(oTask.stoppedAt, oNow, oShift),
					iStopDurationMs = parseInt(mStopDurationHours * 3600000, 10);
				if (!oTask.stopDuration) { // first time stopped
					oTask.stopDuration = iStopDurationMs;
				} else {
					oTask.stopDuration += iStopDurationMs;
				}
				oTask.status = 2;
				// set to started, 
				// getRemainingQuantityAtStopTime calculates via working hours between oNow and stoppedAt
				oTask.estimatedEnd = this.getEndDateInWorkingHours(oNow, this.getRemainingQuantityAtStopTime(oTask), oTask.currentProductivity,
					oShift);
			}
			oModel.update(sPath, oTask);
		},

		/////////////////////////////////////////////////////QUANTITY, PRODUCTIVITY, STARTDATE////////////////////////////////////

		pullTogglePressed: function () {
			// pull/push toggle button of the edit form
			var oFrag = sap.ui.core.Fragment,
				oModel = this.getModel(),
				sObjectPath = this.getModel("taskView").getProperty("/sTaskPath"),
				oTask = oModel.getObject(sObjectPath, {
					select: "status"
				}),
				sSelectedShiftID = oFrag.byId("myFrag2", "shiftSelect").getSelectedKey(),
				oShift = this.getShiftFromID(sSelectedShiftID),
				bPull = this.getModel("appView").getProperty("/pullMode");

			oFrag.byId("myFrag2", "startDate").setEnabled(oTask.status < 2 && !bPull);
			oFrag.byId("myFrag2", "endDate").setEnabled(oTask.status < 2 && bPull);
			oFrag.byId("myFrag2", "endIncWaitDate").setEnabled(oTask.status < 2 && bPull);
			oFrag.byId("myFrag2", "shiftSelect").setEnabled(oTask.status < 2);
			oFrag.byId("myFrag2", "endDate").setValueState("None");
			oFrag.byId("myFrag2", "endDate").setValueStateText("");
			oFrag.byId("myFrag2", "startDate").setValueState("None");
			oFrag.byId("myFrag2", "startDate").setValueStateText("");
			if (!this.inShift(oFrag.byId("myFrag2", "endDate").getDateValue(), oShift)) {
				oFrag.byId("myFrag2", "endDate").setValueState("Error");
				oFrag.byId("myFrag2", "endDate").setValueStateText(this.getResourceBundle().getText("dateNotInShift"));
			}
			if (!this.inShift(oFrag.byId("myFrag2", "startDate").getDateValue(), oShift)) {
				oFrag.byId("myFrag2", "startDate").setValueState("Error");
				oFrag.byId("myFrag2", "startDate").setValueStateText(this.getResourceBundle().getText("dateNotInShift"));
			}
			this._saveButtonEnablement();
		},

		handleStartQuantityEdit: function () {
			var oFrag = sap.ui.core.Fragment,
				oModel = this.getModel(),
				sObjectPath = this.getModel("taskView").getProperty("/sTaskPath"),
				oTask = oModel.getObject(sObjectPath, {
					select: "*"
				});

			this._createBaseEditDialog();

			// load shifts into select control (binding in view doesn't work)
			var oSelect = oFrag.byId("myFrag2", "shiftSelect"),
				oWorkTimeModel = this.getModel("workTimeModel"),
				aShifts = oWorkTimeModel.getProperty("/shifts");

			oSelect.destroyItems();
			for (var i = 0; i < aShifts.length; i++) {
				var oItem = new sap.ui.core.Item({
					key: aShifts[i].ID,
					text: aShifts[i].code
				});
				if (oTask.shift_ID === aShifts[i].ID) {
					oSelect.setSelectedKey(aShifts[i].ID);
				}
				if (aShifts[i].defaultShift) {
					oItem.setText("*" + aShifts[i].code);
				}
				oSelect.addItem(oItem);
			}

			var oStartDate = oFrag.byId("myFrag2", "startDate"),
				oEndDate = oFrag.byId("myFrag2", "endDate"),
				oEndIncWaitDate = oFrag.byId("myFrag2", "endIncWaitDate"),
				oQuantity = oFrag.byId("myFrag2", "quantity"),
				oProductivity = oFrag.byId("myFrag2", "productivity"),
				oProductivityFactor = oFrag.byId("myFrag2", "productivityFactor"),
				oNetDuration = oFrag.byId("myFrag2", "netDuration"),
				mNetDuration,
				oWaitDays = oFrag.byId("myFrag2", "waitingTimeDays"),
				oWaitHours = oFrag.byId("myFrag2", "waitingTimeHours"),
				oWaitMinutes = oFrag.byId("myFrag2", "waitingTimeMinutes"),
				aValues = formatter.dhmFromMs(oTask.waitDuration),
				bPull = this.getModel("appView").getProperty("/pullMode");
			// disable start date and shift select after task started
			oStartDate.setEnabled(oTask.status < 2 && !bPull);
			oEndDate.setEnabled(oTask.status < 2 && bPull);
			oEndIncWaitDate.setEnabled(oTask.status < 2 && bPull);
			oFrag.byId("myFrag2", "shiftSelect").setEnabled(oTask.status < 2);

			oQuantity.setValue(oTask.quantity);
			if (oTask.status < 2) {
				oStartDate.setDateValue(oTask.plannedStart);
			} else {
				oStartDate.setDateValue(oTask.actualStart);
			}
			oEndDate.setDateValue(oTask.estimatedEnd);
			oEndIncWaitDate.setDateValue(new Date(oTask.estimatedEnd.getTime() + (oTask.waitDuration || 0)));
			oProductivity.setValue(parseFloat(oTask.plannedProductivity * oTask.productivityFactor).toFixed(3)); //display value only
			oProductivityFactor.setValue(oTask.productivityFactor);
			mNetDuration = parseFloat(oTask.quantity / (oTask.plannedProductivity * oTask.productivityFactor)).toFixed(3);
			oNetDuration.setValue(formatter.hoursToHoursMinutes(mNetDuration));
			oWaitDays.setValue(aValues[0]);
			oWaitHours.setValue(aValues[1]);
			oWaitMinutes.setValue(aValues[2]);
			oQuantity.setValueState("None");
			oStartDate.setValueState("None");
			oEndDate.setValueState("None");
			oProductivity.setValueState("None");
			oProductivityFactor.setValueState("None");
			oNetDuration.setValueState("None");
			oWaitDays.setValueState("None");
			oWaitHours.setValueState("None");
			oWaitMinutes.setValueState("None");
			this._saveButtonEnablement();
			this.oBaseEditDialog.open();
		},

		handlePlannedQuantityChange: function () {
			var oFrag = sap.ui.core.Fragment,
				oQuantity = oFrag.byId("myFrag2", "quantity"),
				oStartDate = oFrag.byId("myFrag2", "startDate"),
				oEndDate = oFrag.byId("myFrag2", "endDate"),
				oEndDateIncWait = oFrag.byId("myFrag2", "endIncWaitDate"),
				oProductivity = oFrag.byId("myFrag2", "productivity"),
				oNetDuration = oFrag.byId("myFrag2", "netDuration"),
				sQuantity = parseFloat(oQuantity.getValue()).toFixed(3),
				sProductivity = parseFloat(oProductivity.getValue()).toFixed(3),
				mNetDuration,
				sSelectedShiftID = oFrag.byId("myFrag2", "shiftSelect").getSelectedKey(),
				oShift = this.getShiftFromID(sSelectedShiftID),
				oDate,
				iWaitMs = (Number(oFrag.byId("myFrag2", "waitingTimeDays").getValue()) * 24 * 60 +
					Number(oFrag.byId("myFrag2", "waitingTimeHours").getValue()) * 60 +
					Number(oFrag.byId("myFrag2", "waitingTimeMinutes").getValue())) * 60 * 1000;

			if (sQuantity <= 0 || sQuantity === "") {
				oQuantity.setValueState("Error");
				oQuantity.setValueStateText(this.getResourceBundle().getText("invalidQuantity"));
			} else {
				oQuantity.setValueState("None");
				mNetDuration = parseFloat(sQuantity / sProductivity).toFixed(3);
				oNetDuration.setValue(formatter.hoursToHoursMinutes(mNetDuration));
				if (this.getModel("appView").getProperty("/pullMode")) {
					// calculate start date
					oStartDate.setDateValue(this.getPullStartDateInWorkingHours(oEndDate.getDateValue(), Number(sQuantity),
						Number(sProductivity), oShift));
				} else {
					// calculate end dates
					oDate = new Date(this.getEndDateInWorkingHours(oStartDate.getDateValue(), Number(sQuantity),
						Number(sProductivity), oShift));
					oEndDate.setDateValue(oDate);
					oEndDateIncWait.setDateValue(new Date(oDate.getTime() + iWaitMs));
				}
			}
			this._saveButtonEnablement();
		},

		handleStartDateChange: function () {
			// only happens in push mode
			var oFrag = sap.ui.core.Fragment,
				oQuantity = oFrag.byId("myFrag2", "quantity"),
				oStartDate = oFrag.byId("myFrag2", "startDate"),
				oEndDate = oFrag.byId("myFrag2", "endDate"),
				oEndDateIncWait = oFrag.byId("myFrag2", "endIncWaitDate"),
				oProductivity = oFrag.byId("myFrag2", "productivity"),
				mQuantity = parseFloat(oQuantity.getValue()).toFixed(3),
				sStartDate = oStartDate.getDateValue(),
				mProductivity = parseFloat(oProductivity.getValue()).toFixed(3),
				sSelectedShiftID = oFrag.byId("myFrag2", "shiftSelect").getSelectedKey(),
				oShift = this.getShiftFromID(sSelectedShiftID),
				oDate,
				iWaitMs = (Number(oFrag.byId("myFrag2", "waitingTimeDays").getValue()) * 24 * 60 +
					Number(oFrag.byId("myFrag2", "waitingTimeHours").getValue()) * 60 +
					Number(oFrag.byId("myFrag2", "waitingTimeMinutes").getValue())) * 60 * 1000;

			if (!oStartDate || sStartDate === "") {
				oStartDate.setValueState("Error");
				oStartDate.setValueStateText(this.getResourceBundle().getText("invalidDate"));
				this._saveButtonEnablement();
				return;
			} else {
				oStartDate.setValueState("None");
			}
			if (!this.inShift(sStartDate, oShift)) {
				oStartDate.setValueState("Error");
				oStartDate.setValueStateText(this.getResourceBundle().getText("dateNotInShift"));
			} else {
				oStartDate.setValueState("None");
				oStartDate.setValueStateText("");
				oDate = new Date(this.getEndDateInWorkingHours(oStartDate.getDateValue(), mQuantity, mProductivity, oShift));
				oEndDate.setDateValue(oDate);
				oEndDateIncWait.setDateValue(new Date(oDate.getTime() + iWaitMs));
			}
			this._saveButtonEnablement();
		},

		handleEndDateChange: function () {
			// only happens in pull mode
			var oFrag = sap.ui.core.Fragment,
				oQuantity = oFrag.byId("myFrag2", "quantity"),
				oStartDate = oFrag.byId("myFrag2", "startDate"),
				oEndDate = oFrag.byId("myFrag2", "endDate"),
				oEndDateIncWait = oFrag.byId("myFrag2", "endIncWaitDate"),
				oProductivity = oFrag.byId("myFrag2", "productivity"),
				mQuantity = parseFloat(oQuantity.getValue()).toFixed(3),
				sEndDate = oEndDate.getDateValue(),
				mProductivity = parseFloat(oProductivity.getValue()).toFixed(3),
				sSelectedShiftID = oFrag.byId("myFrag2", "shiftSelect").getSelectedKey(),
				oShift = this.getShiftFromID(sSelectedShiftID),
				oDate,
				iWaitMs = (Number(oFrag.byId("myFrag2", "waitingTimeDays").getValue()) * 24 * 60 +
					Number(oFrag.byId("myFrag2", "waitingTimeHours").getValue()) * 60 +
					Number(oFrag.byId("myFrag2", "waitingTimeMinutes").getValue())) * 60 * 1000;

			if (!oEndDate || sEndDate === "") {
				oEndDate.setValueState("Error");
				oEndDate.setValueStateText(this.getResourceBundle().getText("invalidDate"));
				this._saveButtonEnablement();
				return;
			} else {
				oEndDate.setValueState("None");
			}
			if (!this.inShift(sEndDate, oShift)) {
				oEndDate.setValueState("Error");
				oEndDate.setValueStateText(this.getResourceBundle().getText("dateNotInShift"));
			} else {
				oEndDate.setValueState("None");
				oEndDate.setValueStateText("");
				oDate = new Date(this.getPullStartDateInWorkingHours(oEndDate.getDateValue(), mQuantity, mProductivity, oShift));
				oStartDate.setDateValue(oDate);
				oEndDateIncWait.setDateValue(new Date(sEndDate.getTime() + iWaitMs));
			}
			this._saveButtonEnablement();
		},

		handleEndDateIncWaitChange: function () {
			// only happens in pull mode
			var oFrag = sap.ui.core.Fragment,
				oQuantity = oFrag.byId("myFrag2", "quantity"),
				oStartDate = oFrag.byId("myFrag2", "startDate"),
				oEndDate = oFrag.byId("myFrag2", "endDate"),
				oEndDateIncWait = oFrag.byId("myFrag2", "endIncWaitDate"),
				oProductivity = oFrag.byId("myFrag2", "productivity"),
				mQuantity = parseFloat(oQuantity.getValue()).toFixed(3),
				sEndDateIncWait = oEndDateIncWait.getDateValue(),
				mProductivity = parseFloat(oProductivity.getValue()).toFixed(3),
				sSelectedShiftID = oFrag.byId("myFrag2", "shiftSelect").getSelectedKey(),
				oShift = this.getShiftFromID(sSelectedShiftID),
				oDate,
				iWaitMs = (Number(oFrag.byId("myFrag2", "waitingTimeDays").getValue()) * 24 * 60 +
					Number(oFrag.byId("myFrag2", "waitingTimeHours").getValue()) * 60 +
					Number(oFrag.byId("myFrag2", "waitingTimeMinutes").getValue())) * 60 * 1000;

			if (!oEndDateIncWait || sEndDateIncWait === "") {
				oEndDateIncWait.setValueState("Error");
				oEndDateIncWait.setValueStateText(this.getResourceBundle().getText("invalidDate"));
				this._saveButtonEnablement();
				return;
			}
			oEndDateIncWait.setValueState("None");
			oEndDateIncWait.setValueStateText("");
			oDate = new Date(sEndDateIncWait.getTime() - iWaitMs); // new end date
			oDate = this.getPullEndDateInWorkingHours(oDate, oShift);
			oEndDate.setDateValue(oDate);
			oStartDate.setDateValue(this.getPullStartDateInWorkingHours(oDate, mQuantity, mProductivity, oShift));
			this._saveButtonEnablement();
		},

		handleProductivityChange: function () {
			var oFrag = sap.ui.core.Fragment,
				sQuantity = oFrag.byId("myFrag2", "quantity").getValue(),
				oStartDate = oFrag.byId("myFrag2", "startDate"),
				oEndDate = oFrag.byId("myFrag2", "endDate"),
				oEndDateIncWait = oFrag.byId("myFrag2", "endIncWaitDate"),
				oProductivity = oFrag.byId("myFrag2", "productivity"),
				oProductivityFactor = oFrag.byId("myFrag2", "productivityFactor"),
				mProductivity = parseFloat(oProductivity.getValue()).toFixed(3),
				oNetDuration = oFrag.byId("myFrag2", "netDuration"),
				sValueStateText = this.getResourceBundle().getText("invalidProductivity"),
				sSelectedShiftID = oFrag.byId("myFrag2", "shiftSelect").getSelectedKey(),
				oShift = this.getShiftFromID(sSelectedShiftID),
				oModel = this.getModel(),
				sObjectPath = this.getModel("taskView").getProperty("/sTaskPath"),
				oTask = oModel.getObject(sObjectPath, {
					select: "plannedProductivity"
				}),
				mProductivityFactor,
				mNetDuration,
				oDate,
				iWaitMs = (Number(oFrag.byId("myFrag2", "waitingTimeDays").getValue()) * 24 * 60 +
					Number(oFrag.byId("myFrag2", "waitingTimeHours").getValue()) * 60 +
					Number(oFrag.byId("myFrag2", "waitingTimeMinutes").getValue())) * 60 * 1000;

			if (isNaN(mProductivity) || mProductivity <= 0) {
				oProductivity.setValueState("Error");
				oProductivity.setValueStateText(sValueStateText);
			} else {
				oProductivity.setValueState("None");
				oProductivity.setValueStateText("");
				mProductivityFactor = parseFloat(Number(mProductivity) / Number(oTask.plannedProductivity)).toFixed(3);
				oProductivityFactor.setValue(mProductivityFactor);
				mNetDuration = parseFloat(sQuantity / mProductivity).toFixed(3);
				oNetDuration.setValue(formatter.hoursToHoursMinutes(mNetDuration));
				oNetDuration.setValueState("None");
				oNetDuration.setValueStateText("");
				if (this.getModel("appView").getProperty("/pullMode")) { // both end dates stay unchanged
					oStartDate.setDateValue(this.getPullStartDateInWorkingHours(oEndDate.getDateValue(), Number(sQuantity),
						mProductivity, oShift));
				} else {
					oDate = new Date(this.getEndDateInWorkingHours(oStartDate.getDateValue(), Number(sQuantity),
						mProductivity, oShift));
					oEndDate.setDateValue(oDate);
					oEndDateIncWait.setDateValue(new Date(oDate.getTime() + iWaitMs));
				}
			}
			this._saveButtonEnablement();
		},

		handleProductivityFactorChange: function () {
			var oFrag = sap.ui.core.Fragment,
				sQuantity = oFrag.byId("myFrag2", "quantity").getValue(),
				oStartDate = oFrag.byId("myFrag2", "startDate"),
				oEndDate = oFrag.byId("myFrag2", "endDate"),
				oEndDateIncWait = oFrag.byId("myFrag2", "endIncWaitDate"),
				oProductivity = oFrag.byId("myFrag2", "productivity"),
				oProductivityFactor = oFrag.byId("myFrag2", "productivityFactor"),
				mProductivityFactor = parseFloat(oProductivityFactor.getValue()).toFixed(3),
				oNetDuration = oFrag.byId("myFrag2", "netDuration"),
				sSelectedShiftID = oFrag.byId("myFrag2", "shiftSelect").getSelectedKey(),
				oShift = this.getShiftFromID(sSelectedShiftID),
				oModel = this.getModel(),
				sObjectPath = this.getModel("taskView").getProperty("/sTaskPath"),
				oTask = oModel.getObject(sObjectPath, {
					select: "plannedProductivity"
				}),
				sProductivity,
				mNetDuration,
				oDate,
				iWaitMs = (Number(oFrag.byId("myFrag2", "waitingTimeDays").getValue()) * 24 * 60 +
					Number(oFrag.byId("myFrag2", "waitingTimeHours").getValue()) * 60 +
					Number(oFrag.byId("myFrag2", "waitingTimeMinutes").getValue())) * 60 * 1000;

			if (mProductivityFactor <= 0 || isNaN(mProductivityFactor)) {
				oProductivityFactor.setValueState("Error");
				oProductivityFactor.setValueStateText(this.getResourceBundle().getText("invalidProductivity"));
			} else {
				oProductivityFactor.setValueState("None");
				oProductivityFactor.setValueStateText("");
				sProductivity = parseFloat(mProductivityFactor * Number(oTask.plannedProductivity)).toFixed(3);
				oProductivity.setValue(sProductivity);
				mNetDuration = parseFloat(sQuantity / sProductivity).toFixed(3);
				oNetDuration.setValue(formatter.hoursToHoursMinutes(mNetDuration));
				oNetDuration.setValueState("None");
				oNetDuration.setValueStateText("");
				if (this.getModel("appView").getProperty("/pullMode")) { // both end dates stay unchanged
					oStartDate.setDateValue(this.getPullStartDateInWorkingHours(oEndDate.getDateValue(), Number(sQuantity),
						Number(sProductivity), oShift));
				} else {
					oDate = new Date(this.getEndDateInWorkingHours(oStartDate.getDateValue(), Number(sQuantity),
						Number(sProductivity), oShift));
					oEndDate.setDateValue(oDate);
					oEndDateIncWait.setDateValue(new Date(oDate.getTime() + iWaitMs));
				}
			}
			this._saveButtonEnablement();
		},

		_onWaitChange: function (oEvent) {
			var oInput = oEvent.getSource(),
				sValue = oEvent.getParameter("value"),
				oFrag = sap.ui.core.Fragment,
				sEndDate = oFrag.byId("myFrag2", "endDate").getDateValue(),
				oEndDateIncWait = oFrag.byId("myFrag2", "endIncWaitDate"),
				iWaitMs = (Number(oFrag.byId("myFrag2", "waitingTimeDays").getValue()) * 24 * 60 +
					Number(oFrag.byId("myFrag2", "waitingTimeHours").getValue()) * 60 +
					Number(oFrag.byId("myFrag2", "waitingTimeMinutes").getValue())) * 60 * 1000;

			this.oBaseEditDialog.getButtons()[0].setEnabled(false);
			oFrag.byId("myFrag2", "waitingTimeDays").setValueState("None");
			oFrag.byId("myFrag2", "waitingTimeDays").setValueStateText("");
			oFrag.byId("myFrag2", "waitingTimeHours").setValueState("None");
			oFrag.byId("myFrag2", "waitingTimeHours").setValueStateText("");
			oFrag.byId("myFrag2", "waitingTimeMinutes").setValueState("None");
			oFrag.byId("myFrag2", "waitingTimeMinutes").setValueStateText("");
			if (oInput.toString().indexOf("Days") >= 0 && (Number(sValue) < 0 || isNaN(Number(sValue)) || sValue === "")) {
				oFrag.byId("myFrag2", "waitingTimeDays").setValueState("Error");
				oFrag.byId("myFrag2", "waitingTimeDays").setValueStateText(this.getResourceBundle().getText("dayError"));
				return;
			}
			if (oInput.toString().indexOf("Hours") >= 0 && (Number(sValue) < 0 || Number(sValue) > 23 || isNaN(Number(sValue)) || sValue === "")) {
				oFrag.byId("myFrag2", "waitingTimeHours").setValueState("Error");
				oFrag.byId("myFrag2", "waitingTimeHours").setValueStateText(this.getResourceBundle().getText("hoursError"));
				return;
			}
			if (oInput.toString().indexOf("Minutes") >= 0 && (Number(sValue) < 0 || Number(sValue) > 59 || isNaN(Number(sValue)) || sValue ===
					"")) {
				oFrag.byId("myFrag2", "waitingTimeMinutes").setValueState("Error");
				oFrag.byId("myFrag2", "waitingTimeMinutes").setValueStateText(this.getResourceBundle().getText("minutesError"));
				return;
			}
			oEndDateIncWait.setDateValue(new Date(sEndDate.getTime() + iWaitMs));
			this._saveButtonEnablement();
		},

		handleNetDurationChange: function () {
			var oFrag = sap.ui.core.Fragment,
				sQuantity = oFrag.byId("myFrag2", "quantity").getValue(),
				oStartDate = oFrag.byId("myFrag2", "startDate"),
				oEndDate = oFrag.byId("myFrag2", "endDate"),
				oEndDateIncWait = oFrag.byId("myFrag2", "endIncWaitDate"),
				oProductivity = oFrag.byId("myFrag2", "productivity"),
				sProductivity = oProductivity.getValue(),
				oProductivityFactor = oFrag.byId("myFrag2", "productivityFactor"),
				oNetDuration = oFrag.byId("myFrag2", "netDuration"),
				sNetDuration = oNetDuration.getValue(),
				mNetDurationHours = formatter.hoursMinutesToDecimalHours(sNetDuration),
				mProductivityFactor = parseFloat(oProductivityFactor.getValue()).toFixed(3),
				sSelectedShiftID = oFrag.byId("myFrag2", "shiftSelect").getSelectedKey(),
				oShift = this.getShiftFromID(sSelectedShiftID),
				oModel = this.getModel(),
				sObjectPath = this.getModel("taskView").getProperty("/sTaskPath"),
				oTask = oModel.getObject(sObjectPath, {
					select: "plannedProductivity"
				}),
				oDate,
				iWaitMs = (Number(oFrag.byId("myFrag2", "waitingTimeDays").getValue()) * 24 * 60 +
					Number(oFrag.byId("myFrag2", "waitingTimeHours").getValue()) * 60 +
					Number(oFrag.byId("myFrag2", "waitingTimeMinutes").getValue())) * 60 * 1000;

			if (isNaN(mNetDurationHours) || mNetDurationHours <= 0) {
				oNetDuration.setValueState("Error");
				oNetDuration.setValueStateText(this.getResourceBundle().getText("invalidNetDuration"));
			} else {
				oNetDuration.setValueState("None");
				oNetDuration.setValueStateText("");
				mProductivityFactor = parseFloat(sQuantity / (mNetDurationHours * oTask.plannedProductivity)).toFixed(3);
				oProductivityFactor.setValue(mProductivityFactor);
				sProductivity = parseFloat(Number(mProductivityFactor) * Number(oTask.plannedProductivity)).toFixed(3);
				oProductivity.setValue(sProductivity);
				if (this.getModel("appView").getProperty("/pullMode")) { // both end dates stay unchanged
					oStartDate.setDateValue(this.getPullStartDateInWorkingHours(oEndDate.getDateValue(), Number(sQuantity),
						Number(sProductivity), oShift));
				} else {
					oDate = new Date(this.getEndDateInWorkingHours(oStartDate.getDateValue(), Number(sQuantity),
						Number(sProductivity), oShift));
					oEndDate.setDateValue(oDate);
					oEndDateIncWait.setDateValue(new Date(oDate.getTime() + iWaitMs));
				}
			}
			this._saveButtonEnablement();
		},

		handleShiftChange: function (oEvent) {
			var oFrag = sap.ui.core.Fragment,
				oStartDate = oFrag.byId("myFrag2", "startDate").getDateValue(),
				oEndDate = oFrag.byId("myFrag2", "endDate").getDateValue(),
				sSelectedShiftID = oEvent.getParameter("selectedItem").getKey(),
				oShift = this.getShiftFromID(sSelectedShiftID);

			oFrag.byId("myFrag2", "endDate").setValueState("None");
			oFrag.byId("myFrag2", "endDate").setValueStateText("");
			oFrag.byId("myFrag2", "startDate").setValueState("None");
			oFrag.byId("myFrag2", "startDate").setValueStateText("");
			if (!this.inShift(oEndDate, oShift)) {
				oFrag.byId("myFrag2", "endDate").setValueState("Error");
				oFrag.byId("myFrag2", "endDate").setValueStateText(this.getResourceBundle().getText("dateNotInShift"));
			}
			if (!this.inShift(oStartDate, oShift)) {
				oFrag.byId("myFrag2", "startDate").setValueState("Error");
				oFrag.byId("myFrag2", "startDate").setValueStateText(this.getResourceBundle().getText("dateNotInShift"));
			}
			this._saveButtonEnablement();
		},

		_saveButtonEnablement: function () {
			var oFrag = sap.ui.core.Fragment,
				oProductivityFactor = oFrag.byId("myFrag2", "productivityFactor"),
				sProductivityFactor = oProductivityFactor.getValue(),
				oQuantity = oFrag.byId("myFrag2", "quantity"),
				sQuantity = oQuantity.getValue(),
				oStartDate = oFrag.byId("myFrag2", "startDate"),
				sStartDate = oStartDate.getDateValue(),
				oEndDate = oFrag.byId("myFrag2", "endDate"),
				sEndDate = oEndDate.getDateValue(),
				oEndDateIncWait = oFrag.byId("myFrag2", "endIncWaitDate"),
				oSelect = oFrag.byId("myFrag2", "shiftSelect"),
				sSelectedKey = oSelect.getSelectedKey(),
				oDays = oFrag.byId("myFrag2", "waitingTimeDays"),
				oHours = oFrag.byId("myFrag2", "waitingTimeHours"),
				oMinutes = oFrag.byId("myFrag2", "waitingTimeMinutes"),
				iWaitMs = Number(oDays.getValue()) * 24 * 60 + Number(oHours.getValue()) * 60 + Number(oMinutes.getValue()),
				oModel = this.getModel(),
				sObjectPath = this.getModel("taskView").getProperty("/sTaskPath"),
				oTask = oModel.getObject(sObjectPath, {
					select: "*"
				}),
				aButtons = this.oBaseEditDialog.getButtons(),
				bEnabled = true;
			iWaitMs = iWaitMs * 60 * 1000;
			// productivity is not checked because it always changes in sync with the productivity factor
			if (oQuantity.getValueState() === "Error" || oStartDate.getValueState() === "Error" ||
				oEndDate.getValueState() === "Error" || oEndDateIncWait.getValueState() === "Error" ||
				oProductivityFactor.getValueState() === "Error" || oDays.getValueState() === "Error" ||
				oHours.getValueState() === "Error" || oMinutes.getValueState() === "Error") {
				bEnabled = false;
			}
			if (Number(sQuantity) === Number(oTask.quantity) && Number(sProductivityFactor) === Number(oTask.productivityFactor) &&
				sStartDate === oTask.plannedStart && sEndDate === oTask.estimatedEnd && sSelectedKey === oTask.shift_ID &&
				oTask.waitDuration === iWaitMs && bEnabled) {
				bEnabled = false;
			}
			aButtons[0].setEnabled(bEnabled);
		},

		_createBaseEditDialog: function () {
			var oFrag = sap.ui.core.Fragment,
				that = this,
				sQuantity,
				sStartDate,
				sEndDate,
				sProductivityFactor,
				sShiftID,
				oShift,
				sDays,
				sHours,
				sMinutes,
				iWaitMs,
				oModel,
				sObjectPath,
				oTask,
				sTitle = this.getResourceBundle().getText("taskBaseEditTitle"),
				sCancel = this.getResourceBundle().getText("measurementDialogCancelButtonText"),
				sSave = this.getResourceBundle().getText("measurementDialogSaveButtonText");

			if (!that.oBaseEditDialog) {

				that.oBaseEditDialog = new Dialog({
					title: sTitle,
					contentWidth: "55%",
					resizable: true,
					draggable: true,
					content: [
						sap.ui.xmlfragment("myFrag2", "cockpit.Cockpit.view.BaseEditTask", this)
					],
					buttons: [{
						text: sSave,
						enabled: false,
						press: function () {
							sQuantity = oFrag.byId("myFrag2", "quantity").getValue();
							sStartDate = oFrag.byId("myFrag2", "startDate").getDateValue();
							sEndDate = oFrag.byId("myFrag2", "endDate").getDateValue();
							sProductivityFactor = oFrag.byId("myFrag2", "productivityFactor").getValue();
							sShiftID = oFrag.byId("myFrag2", "shiftSelect").getSelectedKey();
							sDays = oFrag.byId("myFrag2", "waitingTimeDays").getValue();
							sHours = oFrag.byId("myFrag2", "waitingTimeHours").getValue();
							sMinutes = oFrag.byId("myFrag2", "waitingTimeMinutes").getValue();
							iWaitMs = (Number(sDays) * 24 * 60 + Number(sHours) * 60 + Number(sMinutes)) * 60 * 1000;
							oModel = that.getModel();
							sObjectPath = that.getModel("taskView").getProperty("/sTaskPath");
							oTask = oModel.getObject(sObjectPath, {
								select: "*"
							});
							oShift = that.getShiftFromID(oTask.shift_ID);
							oTask.plannedStart = sStartDate;
							oTask.quantity = sQuantity;
							oTask.productivityFactor = sProductivityFactor; // planned productivity stays unchanged
							oTask.shift_ID = sShiftID;
							if (oTask.status < 2) {
								oTask.plannedEnd = sEndDate;
								// change current values only before task started; after start measurements will change currentProductivity
								oTask.currentProductivity = parseFloat(oTask.plannedProductivity * oTask.productivityFactor).toFixed(3);
								oTask.estimatedEnd = oTask.plannedEnd;
							} else { // if task was started and quantity or productivity was changed then estimated end must be adjusted
								oTask.estimatedEnd = that.getEndDateInWorkingHours(oTask.actualStart, oTask.quantity, oTask.currentProductivity, oShift);
							}
							oTask.waitDuration = iWaitMs;
							oModel.update(sObjectPath, oTask);

							that.oBaseEditDialog.close();
						}
					}, {
						text: sCancel,
						enabled: true,
						press: function () {
							that.oBaseEditDialog.close();
						}
					}]
				});

				that.oBaseEditDialog.addStyleClass("sapUiContentPadding");
				that.getView().addDependent(that.oBaseEditDialog);
			}
		},

		/////////////////////////////////////////////////////////////////MEASUREMENTS////////////////////////////////////

		onMeasurementListUpdateFinished: function (oEvent) {
			var oList = this.getView().byId("measurementList"),
				sTitle,
				iTotalItems = oEvent.getParameter("total"),
				oViewModel = this.getModel("taskView");

			// only update the counter if the length is final
			if (oList.getBinding("items").isLengthFinal()) {
				if (iTotalItems) {
					sTitle = this.getResourceBundle().getText("detailMeasurementTableHeadingCount", [iTotalItems]);
					var aItems = oList.getItems(),
						sCumulativeQuantity = aItems[aItems.length - 1].getBindingContext().getObject().measurementQuantity;
					oViewModel.setProperty("/cumulativeQuantity", sCumulativeQuantity);
					oViewModel.setProperty("/countMeasurements", iTotalItems);
				} else {
					//Display 'Line Items' instead of 'Line items (0)'
					sTitle = this.getResourceBundle().getText("detailMeasurementTableHeading");
					oViewModel.setProperty("/cumulativeQuantity", "");
					oViewModel.setProperty("/countMeasurements", "0");
				}
				oViewModel.setProperty("/measurementItemListTitle", sTitle);
				this.getView().rerender();
			}
		},

		onAddMeasurement: function () {
			var oFrag = sap.ui.core.Fragment,
				oCreatedBy,
				oModifiedBy,
				oDate,
				oNow = new Date(),
				oQuantity,
				oPoC,
				oDuration,
				aButtons,
				oList = this.getView().byId("measurementList"),
				aItems = oList.getItems(),
				oObject,
				sQuantity = "",
				sDuration = "",
				sOldQuantity = "",
				sOldDuration = "",
				oViewModel = this.getModel("taskView"),
				sTitle = this.getResourceBundle().getText("measurementDialogCreateTitle");

			if (aItems.length > 0) { // get cumulative values from last array item
				oObject = aItems[aItems.length - 1].getBindingContext().getObject();
				sQuantity = oObject.measurementQuantity;
				sDuration = oObject.netDuration;
				sOldQuantity = sQuantity;
				sOldDuration = sDuration;
			}
			// set duration as net duration since start, deduct stop times
			var oModel = this.getModel(),
				sTaskID = this.getModel("taskView").getProperty("/taskID"),
				sTaskPath = "/" + oModel.createKey("Tasks", {
					ID: sTaskID
				}),
				oTask = oModel.getObject(sTaskPath, {
					select: "*"
				}),
				oShift = this.getShiftFromID(oTask.shift_ID),
				fPoC = Number(sQuantity) / oTask.quantity * 100;

			// if measurement is taken outside of a shift, adjust to end of shift
			if (!this.inShift(oNow, oShift)) {
				oNow = this.getShiftEnd(oNow, oShift);
			}
			sDuration = this.getNetDurationHoursFromDates(oTask.actualStart, oNow, oShift);
			sDuration -= oTask.stopDuration / 3600000; // oTask.stopDuration is working hours in ms
			sDuration = parseFloat(sDuration).toFixed(3);
			oViewModel.setProperty("/currentQuantity", sQuantity);
			oViewModel.setProperty("/nextQuantity", "");
			oViewModel.setProperty("/previousQuantity", sQuantity);
			oViewModel.setProperty("/currentDuration", sDuration);
			oViewModel.setProperty("/nextDuration", "");
			oViewModel.setProperty("/previousDuration", sDuration);
			oViewModel.setProperty("/mode", "Create");
			// addMeasurement Button is only enabled if task.status=2 (started)
			this._createMeasurementDialog(true);

			oCreatedBy = oFrag.byId("myFrag", "createdBy");
			oModifiedBy = oFrag.byId("myFrag", "modifiedBy");
			oDate = oFrag.byId("myFrag", "date");
			oQuantity = oFrag.byId("myFrag", "quantity");
			oPoC = oFrag.byId("myFrag", "PoCSlider");
			oDuration = oFrag.byId("myFrag", "duration");
			sDuration = formatter.hoursToHoursMinutes(sDuration);
			aButtons = this.oNewMeasurementDialog.getButtons();
			oCreatedBy.setValue(oTask.createdBy);
			oModifiedBy.setValue(oTask.modifiedBy);
			oDate.setDateValue(oNow);
			oQuantity.setValue(sQuantity);
			oPoC.setValue(fPoC);
			oDuration.setValue(sDuration);
			oQuantity.setValueState("None");
			oDuration.setValueState("None");

			for (var i = 0; i < aButtons.length; i++) {
				aButtons[i].setVisible(false);
			}
			if (!sDuration || sDuration === "00:00") {
				return;
			}
			this._validateEditMeasurement(Number(sQuantity), Number(sDuration));
			//revisit: is sDuration now a 11:11 string?
			this.updateButtonEnabledState(sQuantity, sDuration, sOldQuantity, sOldDuration, aButtons, true);
			this.oNewMeasurementDialog.setTitle(sTitle);
			this.oNewMeasurementDialog.open();
		},

		onPressMeasurement: function (oEvent) {
			var oFrag = sap.ui.core.Fragment,
				oCreatedBy,
				oModifiedBy,
				oDate,
				oQuantity,
				oPoC,
				oDuration,
				aButtons,
				oList = this.getView().byId("measurementList"),
				aItems = oList.getItems(),
				oViewModel = this.getModel("taskView"),
				oMeasurementBC = oEvent.getSource().getBindingContext(),
				sMeasurementID = oMeasurementBC.getProperty("ID"),
				sCreatedBy = oMeasurementBC.getProperty("createdBy"),
				sModifiedBy = oMeasurementBC.getProperty("modifiedBy"),
				sQuantity = oMeasurementBC.getProperty("measurementQuantity"),
				oModel = this.getModel(),
				sTaskID = this.getModel("taskView").getProperty("/taskID"),
				sTaskPath = "/" + oModel.createKey("Tasks", {
					ID: sTaskID
				}),
				oTask = oModel.getObject(sTaskPath, {
					select: "*"
				}),
				fPoC = Number(sQuantity) / oTask.quantity * 100,
				sDuration = oMeasurementBC.getProperty("netDuration"),
				sOldQuantity = sQuantity,
				sOldDuration = sDuration,
				sDate = oMeasurementBC.getProperty("measurementDateTime"),
				sTitle = this.getResourceBundle().getText("measurementDialogEditTitle"),
				sMeasurementPath = "/" + oModel.createKey("Measurements", {
					ID: sMeasurementID
				});
			// update the viewModel
			oViewModel.setProperty("/sMeasurementPath", sMeasurementPath);
			oViewModel.setProperty("/sMeasurementID", sMeasurementID);
			oViewModel.setProperty("/mode", "Edit");
			this.setMeasurementSurroundingValues(aItems);

			// use same fragment for editing/creating
			this._createMeasurementDialog(false);

			oCreatedBy = oFrag.byId("myFrag", "createdBy");
			oModifiedBy = oFrag.byId("myFrag", "modifiedBy");
			oDate = oFrag.byId("myFrag", "date");
			oQuantity = oFrag.byId("myFrag", "quantity");
			oPoC = oFrag.byId("myFrag", "PoCSlider");
			oDuration = oFrag.byId("myFrag", "duration");
			aButtons = this.oNewMeasurementDialog.getButtons();
			oCreatedBy.setValue(sCreatedBy);
			oModifiedBy.setValue(sModifiedBy);
			oDate.setDateValue(sDate);
			oQuantity.setValue(sQuantity);
			oPoC.setValue(fPoC);
			sDuration = formatter.hoursToHoursMinutes(sDuration);
			oDuration.setValue(sDuration);
			oQuantity.setValueState("None");
			oDuration.setValueState("None");

			for (var i = 0; i < aButtons.length; i++) {
				aButtons[i].setVisible(false);
			}
			this._validateEditMeasurement(Number(sQuantity), Number(sDuration)); // revisit ditto
			this.updateButtonEnabledState(sQuantity, sDuration, sOldQuantity, sOldDuration, aButtons, false);
			this.oNewMeasurementDialog.setTitle(sTitle);
			this.oNewMeasurementDialog.open();
		},

		handleQuantityChange: function () {
			var oFrag = sap.ui.core.Fragment,
				oQuantity = oFrag.byId("myFrag", "quantity"),
				oPoC = oFrag.byId("myFrag", "PoCSlider"),
				oDuration = oFrag.byId("myFrag", "duration"),
				sQuantity = oQuantity.getValue(),
				fPoC = oPoC.getValue(),
				sDuration = oDuration.getValue(),
				aButtons = this.oNewMeasurementDialog.getButtons(),
				bCreate = this.getModel("taskView").getProperty("/mode") === "Create",
				sOldQuantity = this.getModel("taskView").getProperty("/currentQuantity"),
				sOldDuration = this.getModel("taskView").getProperty("/currentDuration"),
				sTaskID = this.getModel("taskView").getProperty("/taskID"),
				oModel = this.getModel(),
				sTaskPath = "/" + oModel.createKey("Tasks", {
					ID: sTaskID
				}),
				oTask = oModel.getObject(sTaskPath, {
					select: "*"
				});

			if (sQuantity !== sOldQuantity) {
				fPoC = Number(sQuantity) / oTask.quantity * 100;
				oPoC.setValue(fPoC);
			} else {
				sQuantity = parseFloat(oTask.quantity * fPoC / 100).toFixed(3);
				oQuantity.setValue(sQuantity);
			}

			this._validateEditMeasurement(Number(sQuantity), Number(sDuration));
			this.updateButtonEnabledState(sQuantity, sDuration, sOldQuantity, sOldDuration, aButtons, bCreate);
		},

		handleSliderChange: function () {
			var oFrag = sap.ui.core.Fragment,
				oQuantity = oFrag.byId("myFrag", "quantity"),
				oPoC = oFrag.byId("myFrag", "PoCSlider"),
				sQuantity = oQuantity.getValue(),
				fPoC = oPoC.getValue(),
				sTaskID = this.getModel("taskView").getProperty("/taskID"),
				oModel = this.getModel(),
				sTaskPath = "/" + oModel.createKey("Tasks", {
					ID: sTaskID
				}),
				oTask = oModel.getObject(sTaskPath, {
					select: "quantity"
				});

			sQuantity = parseFloat(oTask.quantity * fPoC / 100).toFixed(3);
			oQuantity.setValue(sQuantity);
			this.handleQuantityChange();
		},

		_createMeasurementDialog: function (bCreate) {
			var oFrag = sap.ui.core.Fragment,
				that = this,
				sQuantity,
				sDuration,
				oDate,
				oModel,
				oViewModel = this.getView().getModel("taskView"),
				sProjectID = this.getModel("appView").getProperty("/selectedProjectID"),
				sTaskID = oViewModel.getProperty("/taskID"),
				sObjectPath,
				oMeasurement,
				sCreate = this.getResourceBundle().getText("measurementDialogCreateButtonText"),
				sCancel = this.getResourceBundle().getText("measurementDialogCancelButtonText"),
				sDelete = this.getResourceBundle().getText("measurementDialogDeleteButtonText"),
				sSave = this.getResourceBundle().getText("measurementDialogSaveButtonText"),
				sConfirmText = this.getResourceBundle().getText("measurementDialogConfirmDeleteText"),
				sConfirmTitle = this.getResourceBundle().getText("measurementDialogConfirmDeleteTitle");

			if (!that.oNewMeasurementDialog) {

				that.oNewMeasurementDialog = new Dialog({
					title: "",
					content: [
						sap.ui.xmlfragment("myFrag", "cockpit.Cockpit.view.AddMeasurement", this)
					],
					buttons: [{
						text: sCreate,
						enabled: false,
						visible: bCreate,
						press: function () {
							oDate = new Date();
							sTaskID = oViewModel.getProperty("/taskID");
							sQuantity = oFrag.byId("myFrag", "quantity").getValue();
							sDuration = oFrag.byId("myFrag", "duration").getValue();
							sDuration = formatter.hoursMinutesToDecimalHours(sDuration);
							oModel = that.getView().getModel();
							oModel.createEntry("/Measurements", {
								properties: {
									project_ID: sProjectID,
									task_ID: sTaskID,
									measurementDateTime: oDate,
									measurementQuantity: sQuantity,
									netDuration: sDuration
								}
							});
							oModel.submitChanges();
							that._updateTaskAfterNewMeasurement(sTaskID, sQuantity, sDuration);
							that.oNewMeasurementDialog.close();
						}
					}, {
						text: sSave,
						enabled: false,
						visible: !bCreate,
						press: function () {
							sQuantity = oFrag.byId("myFrag", "quantity").getValue();
							sDuration = oFrag.byId("myFrag", "duration").getValue();
							sDuration = formatter.hoursMinutesToDecimalHours(sDuration);

							oModel = that.getModel();
							sObjectPath = that.getModel("taskView").getProperty("/sMeasurementPath");
							oMeasurement = oModel.getObject(sObjectPath, {
								select: "*"
							});
							oMeasurement.measurementQuantity = sQuantity;
							oMeasurement.netDuration = sDuration;
							oModel.update(sObjectPath, oMeasurement);

							// update performance values if the last measurement was edited
							var oList = that.getView().byId("measurementList"),
								aItems = oList.getItems(),
								sLastMeasurementID;
							if (aItems.length > 0) {
								sLastMeasurementID = aItems[aItems.length - 1].getBindingContext().getObject().ID;
								if (sLastMeasurementID === oMeasurement.ID) {
									that._updateTaskAfterNewMeasurement(sTaskID, sQuantity, sDuration);
								}
							}
							that.oNewMeasurementDialog.close();
						}
					}, {
						text: sDelete,
						enabled: false,
						visible: !bCreate,
						press: function () {
							oModel = that.getModel();
							sObjectPath = that.getModel("taskView").getProperty("/sMeasurementPath");
							MessageBox.confirm(
								sConfirmText, {
									icon: MessageBox.Icon.WARNING,
									title: sConfirmTitle,
									actions: [sap.m.MessageBox.Action.OK, sap.m.MessageBox.Action.CANCEL],
									initialFocus: MessageBox.Action.CANCEL,
									onClose: function (sAction) {
										if (sAction === "OK") {
											// save quantity, duration of previous measurement if last measurement was deleted
											// aItems will change shortly after remove
											var aItems = that.getView().byId("measurementList").getItems(),
												bLastMeasurement = sObjectPath === aItems[aItems.length - 1].getBindingContext().getPath();
											if (bLastMeasurement) {
												if (aItems.length > 1) { // there is a previous measurement
													sQuantity = aItems[aItems.length - 2].getBindingContext().getProperty("measurementQuantity");
													sDuration = aItems[aItems.length - 2].getBindingContext().getProperty("netDuration");
												} else {
													sQuantity = 0;
													sDuration = 0;
												}
											}
											oModel.remove(sObjectPath, {
												success: function () {
													// update performance values if the last measurement was deleted
													if (bLastMeasurement) { // there is a previous measurement
														that._updateTaskAfterNewMeasurement(sTaskID, sQuantity, sDuration);
													}
												},
												error: function (oError) {
													Log.error("Error deleting measurement");
												}
											});
										}
									}
								}
							);
							that.oNewMeasurementDialog.close();
						}
					}, {
						text: sCancel,
						enabled: true,
						visible: true,
						press: function () {
							that.oNewMeasurementDialog.close();
						}
					}]
				});

				that.oNewMeasurementDialog.addStyleClass("sapUiContentPadding");
				this.getView().addDependent(that.oNewMeasurementDialog);
			}
		},

		setMeasurementSurroundingValues: function (aItems) { // for edit mode only
			// set surrounding values for the measurement in the viewModel
			var oViewModel = this.getModel("taskView"),
				sMeasurementID = oViewModel.getProperty("/sMeasurementID"),
				sPreviousQuantity = "",
				sPreviousDuration = "",
				sNextQuantity = "",
				sNextDuration = "",
				iPressedMeasurement,
				oMeasurement;

			// find position of measurement 
			for (var i = 0; i < aItems.length; i++) {
				oMeasurement = aItems[i].getBindingContext().getObject();
				if (oMeasurement.ID === sMeasurementID) {
					iPressedMeasurement = i;
					break;
				}
			}
			// get values before and after
			if (iPressedMeasurement === 0) { //first row
				if (aItems.length > 1) { // next row exists
					sNextQuantity = aItems[iPressedMeasurement + 1].getBindingContext().getObject().measurementQuantity;
					sNextDuration = aItems[iPressedMeasurement + 1].getBindingContext().getObject().netDuration;
				}
			} else { // not first row
				sPreviousQuantity = aItems[iPressedMeasurement - 1].getBindingContext().getObject().measurementQuantity;
				sPreviousDuration = aItems[iPressedMeasurement - 1].getBindingContext().getObject().netDuration;
				if ((iPressedMeasurement + 1) < aItems.length) { // next row exists
					sNextQuantity = aItems[iPressedMeasurement + 1].getBindingContext().getObject().measurementQuantity;
					sNextDuration = aItems[iPressedMeasurement + 1].getBindingContext().getObject().netDuration;
				}
			}
			oViewModel.setProperty("/selectedMeasurement", iPressedMeasurement);
			oViewModel.setProperty("/previousQuantity", sPreviousQuantity);
			oViewModel.setProperty("/nextQuantity", sNextQuantity);
			oViewModel.setProperty("/previousDuration", sPreviousDuration);
			oViewModel.setProperty("/nextDuration", sNextDuration);
		},

		_validateEditMeasurement: function (mQuantity, mDuration) {
			// values must be compared as Numbers! mQuantity, mDuration are passed as numbers
			var oFrag = sap.ui.core.Fragment,
				oQuantity = oFrag.byId("myFrag", "quantity"),
				oDuration = oFrag.byId("myFrag", "duration"),
				oViewModel = this.getView().getModel("taskView"),
				mPreviousQuantity = Number(oViewModel.getProperty("/previousQuantity")),
				mPreviousDuration = Number(oViewModel.getProperty("/previousDuration")),
				mNextQuantity = Number(oViewModel.getProperty("/nextQuantity")),
				mNextDuration = Number(oViewModel.getProperty("/nextDuration")),
				bCreate = oViewModel.getProperty("/mode") === "Create",
				sEnterQuantity = this.getResourceBundle().getText("measurementInputStateEmptyQuantity"),
				sEnterDuration = this.getResourceBundle().getText("measurementInputStateEmptyDuration"),
				sQuantityMustBeGreater = this.getResourceBundle().getText("measurementInputStateQuantityMustBeGreater"),
				sQuantityMustBeSmaller = this.getResourceBundle().getText("measurementInputStateQuantityMustBeSmaller"),
				sQuantityMustBeAndSmaller = this.getResourceBundle().getText("measurementInputStateQuantityMustBeAndSmaller"),
				sDurationMustBeGreater = this.getResourceBundle().getText("measurementInputStateDurationMustBeGreater"),
				sDurationMustBeSmaller = this.getResourceBundle().getText("measurementInputStateDurationMustBeSmaller"),
				sDurationMustBeAndSmaller = this.getResourceBundle().getText("measurementInputStateDurationMustBeAndSmaller");

			oQuantity.setValueState("None");
			oDuration.setValueState("None");

			if (!mQuantity || mQuantity === 0) {
				oQuantity.setValueState("Error");
				oQuantity.setValueStateText(sEnterQuantity);
				return false;
			}
			if (!mDuration || mDuration === 0) {
				oDuration.setValueState("Error");
				oDuration.setValueStateText(sEnterDuration);
				return false;
			}
			if (bCreate) {
				if (mQuantity <= mPreviousQuantity) {
					oQuantity.setValueState("Error");
					oQuantity.setValueStateText(sQuantityMustBeGreater + " " + mPreviousQuantity);
					return false;
				} else if (mDuration <= mPreviousDuration) {
					oDuration.setValueState("Error");
					oDuration.setValueStateText(sDurationMustBeGreater + " " + mPreviousDuration);
					return false;
				} else {
					return true;
				}
			}

			if (mPreviousQuantity > 0) { // not the first measurement
				if (mNextQuantity > 0) { // not the last measurement
					if (mQuantity <= mPreviousQuantity || mQuantity >= mNextQuantity) {
						oQuantity.setValueState("Error");
						oQuantity.setValueStateText(sQuantityMustBeGreater + " " + mPreviousQuantity + " " + sQuantityMustBeAndSmaller + " " +
							mNextQuantity);
						return false;
					}
				} else if (mQuantity <= mPreviousQuantity) { // last measurement
					oQuantity.setValueState("Error");
					oQuantity.setValueStateText(sQuantityMustBeGreater + " " + mPreviousQuantity);
					return false;
				}
			} else if (mNextQuantity > 0 && mQuantity >= mNextQuantity) { // first measurement
				oQuantity.setValueState("Error");
				oQuantity.setValueStateText(sQuantityMustBeSmaller + " " + mNextQuantity);
				return false;
			}

			if (mPreviousDuration > 0) { // not the first measurement
				if (mNextDuration > 0) { // not the last measurement
					if (mDuration <= mPreviousDuration || mDuration >= mNextDuration) {
						oDuration.setValueState("Error");
						oDuration.setValueStateText(sDurationMustBeGreater + " " + mPreviousDuration + " " + sDurationMustBeAndSmaller + " " +
							mNextDuration);
						return false;
					}
				} else if (mDuration <= mPreviousDuration) { // last measurement
					oDuration.setValueState("Error");
					oDuration.setValueStateText(sDurationMustBeGreater + " " + mPreviousDuration);
					return false;
				}
			} else { // first measurement
				if (mNextDuration > 0 && mDuration >= mNextDuration) {
					oDuration.setValueState("Error");
					oDuration.setValueStateText(sDurationMustBeSmaller + " " + mNextDuration);
					return false;
				}
			}
			return true;
		},

		updateButtonEnabledState: function (sQuantity, sDuration, sOldQuantity, sOldDuration, aButtons, bCreate) {
			var bEnabled = sQuantity !== "" && sDuration !== "",
				oFrag = sap.ui.core.Fragment,
				bQuantityError = oFrag.byId("myFrag", "quantity").getValueState() === "Error",
				//bDurationError = oFrag.byId("myFrag", "duration").getValueState() === "Error",
				sCreateButtonText = this.getResourceBundle().getText("measurementDialogCreateButtonText"),
				sSaveButtonText = this.getResourceBundle().getText("measurementDialogSaveButtonText"),
				sDeleteButtonText = this.getResourceBundle().getText("measurementDialogDeleteButtonText"),
				sCancelButtonText = this.getResourceBundle().getText("measurementDialogCancelButtonText");

			// no better way identifying buttons? (no ID?)
			for (var i = 0; i < aButtons.length; i++) {
				if (aButtons[i].getText() === sCreateButtonText && bCreate && !bQuantityError && bEnabled) {
					aButtons[i].setEnabled(bEnabled);
					aButtons[i].setVisible(true);
				}
				if (aButtons[i].getText() === sSaveButtonText && !bCreate && sQuantity !== sOldQuantity && !bQuantityError && bEnabled) {
					aButtons[i].setEnabled(bEnabled);
					aButtons[i].setVisible(true);
				}
				if (aButtons[i].getText() === sDeleteButtonText && !bCreate) {
					aButtons[i].setEnabled(bEnabled);
					aButtons[i].setVisible(true);
				}
				if (aButtons[i].getText() === sCancelButtonText) {
					aButtons[i].setEnabled(true);
					aButtons[i].setVisible(true);
				}
			}
		},

		_updateTaskAfterNewMeasurement: function (sTaskID, quantity, duration) {
			// quantity, duratio are from last measurement (=actual)
			var oModel = this.getModel(),
				sPath = "/" + oModel.createKey("Tasks", {
					ID: sTaskID
				}),
				oTask = oModel.getObject(sPath, {
					select: "*"
				}),
				oShift = this.getShiftFromID(oTask.shift_ID),
				mRemainingQuantity;
			oTask.currentProductivity = (quantity === 0) ? oTask.plannedProductivity : parseFloat(quantity / duration).toFixed(3);
			oTask.KPI = parseFloat(oTask.currentProductivity / (oTask.plannedProductivity * oTask.productivityFactor)).toFixed(3);
			// calculate duration and end date based on remaining quantity and current productivity
			mRemainingQuantity = oTask.quantity - quantity;
			if (mRemainingQuantity > 0) { // otherwise extra work
				oTask.estimatedEnd = this.getEndDateInWorkingHours(new Date(), mRemainingQuantity, oTask.currentProductivity, oShift);
			} else {
				var oNow = new Date();
				if (!this.inShift(oNow, oShift)) {
					oTask.estimatedEnd = this.getShiftEnd(oNow, oShift);
				} else {
					oTask.estimatedEnd = oNow;
				}
			}
			// update actualQuantity and subby total actual cost if not lump sum
			oTask.actualQuantity = parseFloat(quantity).toFixed(3);
			if (oTask.price && !oTask.lumpsum) { // unit rate contract
				oTask.actualTotalPrice = parseFloat(oTask.actualQuantity * oTask.price).toFixed(3);
			}
			oModel.update(sPath, oTask, {
				error: function (oError) {
					Log.error("Error updating task after measurement change");
				}
			});
		},

		/////////////////////////////////////////////////////////////////FOREMAN////////////////////////////////////

		onRemoveForeman: function () {
			var oModel = this.getModel(),
				oBC = this.getView().getBindingContext();

			oModel.setProperty("supervisor_ID", null, oBC);
			oModel.submitChanges({
				error: function () {
					Log.error("Error removing Foreman");
				}
			});
		},

		onAddEditForeman: function () {
			var oFrag = sap.ui.core.Fragment,
				oList,
				aItems = [];

			this._createForemanDialog();
			this._filterForemanList();
			oList = oFrag.byId("addForemanFrag", "addForemanList2");
			aItems = oList.getItems();
			aItems.forEach(function (oItem) {
				oList.setSelectedItem(oItem, false);
			});
			this.oAddForemanDialog.open();
		},

		_filterForemanList: function () {
			var oFrag = sap.ui.core.Fragment,
				sProjectID = this.getModel("appView").getProperty("/selectedProjectID"),
				sProfessionKey = oFrag.byId("addForemanFrag", "professionSelect2").getSelectedKey(),
				aFilters = [
					new Filter("deployment/project_ID", sap.ui.model.FilterOperator.EQ, sProjectID),
					new Filter("profession/description", sap.ui.model.FilterOperator.EQ, sProfessionKey)
				],
				oAddForemanList = oFrag.byId("addForemanFrag", "addForemanList2"),
				sQuery = oFrag.byId("addForemanFrag", "foremanSearchField2").getValue();

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
						sap.ui.xmlfragment("addForemanFrag", "cockpit.Cockpit.view.AddForemanFromTask", this)
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
				oBC = this.getView().getBindingContext(),
				oModel = this.getModel(),
				sForemanID;

			if (bSelected && oBC) {
				sForemanID = oSelectedItem.getBindingContext().getProperty("ID");
				oModel.setProperty("supervisor_ID", sForemanID, oBC);
				if (this.getModel("taskView").getProperty("/commitAtForemanSelect") && oBC.getProperty("status") === 0) {
					oModel.setProperty("status", 1, oBC);
				}
				oModel.submitChanges();
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
				oList = oFrag.byId("addForemanFrag", "addForemanList2"),
				sTitle,
				iTotalItems = oEvent.getParameter("total"),
				oViewModel = this.getModel("taskView");

			// only update the counter if the length is final
			if (oList.getBinding("items").isLengthFinal()) {
				if (iTotalItems) {
					sTitle = this.getResourceBundle().getText("addForemanListTitle", [iTotalItems]);
				} else {
					sTitle = this.getResourceBundle().getText("addForemanListTitleEmpty");
				}
				oViewModel.setProperty("/addForemanListTitle", sTitle);
			}
		},

		////////////////////////////////////////////////////CREWS////WORKERS////////////////////////////////////

		onCrewListUpdateFinished: function (oEvent) {
			var oList = this.getView().byId("taskCrewsList"),
				oViewModel = this.getModel("taskView"),
				sTitle, sCount,
				iTotalItems = oEvent.getParameter("total");

			// only update the counter if the length is final
			if (oList.getBinding("items").isLengthFinal()) {
				if (iTotalItems) {
					sTitle = this.getResourceBundle().getText("taskCrewTableTitle", [iTotalItems]);
				} else {
					//Display 'Line Items' instead of 'Line items (0)'
					sTitle = this.getResourceBundle().getText("taskCrewTableTitleEmpty");
				}
				oViewModel.setProperty("/crewItemListTitle", sTitle);
				oViewModel.setProperty("/countCrews", iTotalItems);
				sCount = iTotalItems + "+" + oViewModel.getProperty("/countWorkers");
				oViewModel.setProperty("/countLabour", sCount);
				this.setStaffingStatus();
				this._setLaborModel();

				// determine crew clashes and add them to the clash model
				var aCrews = oList.getItems(),
					oTask = this.getView().getBindingContext().getObject({
						select: "plannedStart, actualStart, estimatedEnd"
					}),
					oWorkforceClashModel = this.getModel("workforceClashModel"),
					that = this;
				aCrews.forEach(function (oCrew) {
					oCrew.setHighlight(sap.ui.core.MessageType.Warning); // indicate waiting until clashes determined
				});
				aCrews.reduce(function (oAggr, oCrew, i) {
					new Promise(function () {
						var sCrewsForTaskID = oCrew.getBindingContext().getProperty("ID"),
							sCrewID = oCrew.getBindingContext().getProperty("crew_ID"),
							oStart = oTask.actualStart ? oTask.actualStart : oTask.plannedStart,
							oEnd = oTask.estimatedEnd,
							oCrewClashTask;
						// find the tasks with an overlap where the same crew is allocated 
						that.crewClash(sCrewsForTaskID, sCrewID, oStart, oEnd).then(function (aClashingTasksOfRow) {
							if (aClashingTasksOfRow.length > 0) {
								oCrew.setHighlight(sap.ui.core.MessageType.Error);
								oCrew.getCells()[3].setEnabled(true);
								// add to clash model
								for (var i = 0; i < aClashingTasksOfRow.length; i++) {
									oCrewClashTask = aClashingTasksOfRow[i];
									oCrewClashTask.overlappedCrewID = sCrewID; // add the ID for filtering
									oWorkforceClashModel.setProperty("/overlappingTasksOfCrews",
										oWorkforceClashModel.getProperty("/overlappingTasksOfCrews").concat(oCrewClashTask));
								}
							} else {
								oCrew.setHighlight(sap.ui.core.MessageType.Success);
								oCrew.getCells()[3].setEnabled(false);
							}
						});
					});
				}, Promise.resolve());
			}
		},

		onShowCrewClash: function (oEvent) {
			var oFrag = sap.ui.core.Fragment,
				sTitle = this.getResourceBundle().getText("overLappingTaskAssignmentsPopoverTitle"),
				oButton = oEvent.getSource(),
				oWorkforceClashModel = this.getModel("workforceClashModel"),
				oRowBC = oButton.getBindingContext(),
				sCrewName = oRowBC.getProperty("crew/crewName") + " (" + oRowBC.getProperty("crew/crewNumber") + ")",
				aFilter = new Filter("overlappedCrewID", sap.ui.model.FilterOperator.EQ, oRowBC.getProperty("crew/ID"));

			if (!this.oCrewClashPopover) {
				this.oCrewClashPopover = new sap.m.Popover({
					title: sTitle,
					contentWidth: "800px",
					placement: sap.m.PlacementType.Left,
					content: [
						sap.ui.xmlfragment("crewClashFrag", "cockpit.Cockpit.view.ShowCrewClashes", this)
					]
				});
				this.oCrewClashPopover.addStyleClass("sapUiContentPadding");
				this.getView().addDependent(this.oCrewClashPopover);
			}
			var oTaskCrewClashList = oFrag.byId("crewClashFrag", "crewClashesTaskList"),
				aTasks = oTaskCrewClashList.getItems();
			this.getModel("taskView").setProperty("/crewClashTitle", sCrewName + " " + this.getResourceBundle().getText("crewClashTableTitle"));
			oTaskCrewClashList.getBinding("items").filter(aFilter); // filter the clash model for the crew
			for (var i = 0; i < aTasks.length; i++) { // deselect in case of reopen and just one item in the list
				oTaskCrewClashList.setSelectedItem(aTasks[i], false);
			}
			this.oCrewClashPopover.openBy(oButton);
		},

		onCrewClashTaskSelectionChange: function (oEvent) {
			var oModel = this.getModel(),
				oViewModel = this.getModel("taskView"),
				sID = oEvent.getParameter("listItem").getBindingContext("workforceClashModel").getProperty("ID"),
				sObjectPath = "/" + oModel.createKey("Tasks", {
					ID: sID
				});

			this.oCrewClashPopover.close();
			this._bindView(sObjectPath);
			oViewModel.setProperty("/taskID", sID);
			oViewModel.setProperty("/sTaskPath", sObjectPath);
		},

		onWorkerListUpdateFinished: function (oEvent) {
			var oList = this.getView().byId("taskWorkersList"),
				oViewModel = this.getModel("taskView"),
				sTitle, sCount,
				iTotalItems = oEvent.getParameter("total");

			// only update the counter if the length is final
			if (oList.getBinding("items").isLengthFinal()) {
				if (iTotalItems) {
					sTitle = this.getResourceBundle().getText("taskWorkerTableTitleCount", [iTotalItems]);
				} else {
					//Display 'Line Items' instead of 'Line items (0)'
					sTitle = this.getResourceBundle().getText("taskWorkerTableTitleEmpty");
				}
				oViewModel.setProperty("/workerItemListTitle", sTitle);
				oViewModel.setProperty("/countWorkers", iTotalItems);
				sCount = oViewModel.getProperty("/countCrews") + "+" + iTotalItems;
				oViewModel.setProperty("/countLabour", sCount);
				this.setStaffingStatus();
				this._setLaborModel();
				// determine worker clashes and add them to the clash model
				var aWorkers = oList.getItems(),
					oTask = this.getView().getBindingContext().getObject({
						select: "plannedStart, actualStart, estimatedEnd"
					}),
					oWorkforceClashModel = this.getModel("workforceClashModel"),
					that = this;
				aWorkers.forEach(function (oWorker) {
					oWorker.setHighlight(sap.ui.core.MessageType.Warning); // indicate waiting until clashes determined
				});
				aWorkers.reduce(function (oAggr, oWorker, i) {
					new Promise(function () {
						var sWorkersForTaskID = oWorker.getBindingContext().getProperty("ID"),
							sWorkerID = oWorker.getBindingContext().getProperty("worker_ID"),
							oStart = oTask.actualStart ? oTask.actualStart : oTask.plannedStart,
							oEnd = oTask.estimatedEnd,
							oWorkerClashTask;
						// find the tasks with an overlap where the same crew is allocated 
						that.workerClash(sWorkersForTaskID, sWorkerID, oStart, oEnd).then(function (aClashingTasksOfRow) {
							if (aClashingTasksOfRow.length > 0) {
								oWorker.setHighlight(sap.ui.core.MessageType.Error);
								oWorker.getCells()[3].setEnabled(true);
								// add to clash model
								for (var i = 0; i < aClashingTasksOfRow.length; i++) {
									oWorkerClashTask = aClashingTasksOfRow[i];
									oWorkerClashTask.overlappedWorkerID = sWorkerID; // add the ID for filtering
									oWorkforceClashModel.setProperty("/overlappingTasksOfWorkers",
										oWorkforceClashModel.getProperty("/overlappingTasksOfWorkers").concat(oWorkerClashTask));
								}
							} else {
								oWorker.setHighlight(sap.ui.core.MessageType.Success);
								oWorker.getCells()[3].setEnabled(false);
							}
						});
					});
				}, Promise.resolve());
			}
		},

		onShowWorkerClash: function (oEvent) {
			var oFrag = sap.ui.core.Fragment,
				sTitle = this.getResourceBundle().getText("overLappingTaskAssignmentsPopoverTitle"),
				oButton = oEvent.getSource(),
				oWorkforceClashModel = this.getModel("workforceClashModel"),
				oRowBC = oButton.getBindingContext(),
				sWorkerName = oRowBC.getProperty("worker/lastName") + " " + oRowBC.getProperty("worker/firstName"),
				aFilter = new Filter("overlappedWorkerID", sap.ui.model.FilterOperator.EQ, oRowBC.getProperty("worker/ID"));

			if (!this.oWorkerClashPopover) {
				this.oWorkerClashPopover = new sap.m.Popover({
					title: sTitle,
					contentWidth: "800px",
					placement: sap.m.PlacementType.Left,
					content: [
						sap.ui.xmlfragment("workerClashFrag", "cockpit.Cockpit.view.ShowWorkerClashes", this)
					]
				});
				this.oWorkerClashPopover.addStyleClass("sapUiContentPadding");
				this.getView().addDependent(this.oWorkerClashPopover);
			}
			var oTaskWorkerClashList = oFrag.byId("workerClashFrag", "workerClashesTaskList"),
				aTasks = oTaskWorkerClashList.getItems();
			this.getModel("taskView").setProperty("/workerClashTitle", sWorkerName + " " +
				this.getResourceBundle().getText("crewClashTableTitle"));
			oTaskWorkerClashList.getBinding("items").filter(aFilter); // filter the clash model for the worker
			for (var i = 0; i < aTasks.length; i++) { // deselect in case of reopen and just one item in the list
				oTaskWorkerClashList.setSelectedItem(aTasks[i], false);
			}
			this.oWorkerClashPopover.openBy(oButton);
		},

		onWorkerClashTaskSelectionChange: function (oEvent) {
			var oModel = this.getModel(),
				oViewModel = this.getModel("taskView"),
				sID = oEvent.getParameter("listItem").getBindingContext("workforceClashModel").getProperty("ID"),
				sObjectPath = "/" + oModel.createKey("Tasks", {
					ID: sID
				});

			this.oWorkerClashPopover.close();
			this._bindView(sObjectPath);
			oViewModel.setProperty("/taskID", sID);
			oViewModel.setProperty("/sTaskPath", sObjectPath);
		},

		/////////////////////END CLASHES////////////////////////////////

		onCrewSelectionChange: function () {
			var oList = this.byId("taskCrewsList"),
				aSelectedItems = oList.getSelectedItems();

			if (aSelectedItems.length > 0) {
				this.getModel("taskView").setProperty("/crewSelected", true);
			} else {
				this.getModel("taskView").setProperty("/crewSelected", false);
			}
		},

		onWorkerSelectionChange: function () {
			var oList = this.byId("taskWorkersList"),
				aSelectedItems = oList.getSelectedItems();

			if (aSelectedItems.length > 0) {
				this.getModel("taskView").setProperty("/workerSelected", true);
			} else {
				this.getModel("taskView").setProperty("/workerSelected", false);
			}
		},

		onRemoveCrew: function () {
			var oModel = this.getModel(),
				oList = this.byId("taskCrewsList"),
				aSelectedItems = oList.getSelectedItems(),
				sCrewsForTaskID,
				sPath,
				that = this;

			for (var i = 0; i < aSelectedItems.length; i++) {
				sCrewsForTaskID = aSelectedItems[i].getBindingContext().getProperty("ID");
				sPath = "/" + oModel.createKey("CrewsForTask", {
					ID: sCrewsForTaskID
				});
				oModel.remove(sPath, {
					success: function (oData) {
						that.getModel("taskView").setProperty("/crewSelected", false);
					},
					error: function (oError) {
						Log.error("Error removing crew: " + JSON.stringify(oError));
					}
				});
			}
		},

		onRemoveWorker: function () {
			var oModel = this.getModel(),
				oList = this.byId("taskWorkersList"),
				aSelectedItems = oList.getSelectedItems(),
				sWorkersForTaskID,
				sPath,
				that = this;

			for (var i = 0; i < aSelectedItems.length; i++) {
				sWorkersForTaskID = aSelectedItems[i].getBindingContext().getProperty("ID");
				sPath = "/" + oModel.createKey("WorkersForTask", {
					ID: sWorkersForTaskID
				});
				oModel.remove(sPath, {
					success: function (oData) {
						that.getModel("taskView").setProperty("/workerSelected", false);
					},
					error: function (oError) {
						Log.error("Error removing worker: " + JSON.stringify(oError));
					}
				});
			}
		},

		_setLaborModel: function () {
			var oViewModel = this.getModel("taskView"),
				oCrewList = this.byId("taskCrewsList"),
				oWorkerList = this.byId("taskWorkersList"),
				oPlannedLabourValues,
				oActualLabourValues,
				oTask = this.getView().getBindingContext().getObject();

			if (oCrewList.getItems().length === 0 && oWorkerList.getItems().length === 0) {
				oViewModel.setProperty("plannedLabourHours", "0");
				oViewModel.setProperty("actualLabourHours", "0");
				oViewModel.setProperty("plannedLabourCost", "0.00");
				oViewModel.setProperty("actualLabourCost", "0.00");
			} else {
				oPlannedLabourValues = this.getPlannedLabourValues(oTask);
				oViewModel.setProperty("/plannedLabourHours", oPlannedLabourValues.hours);
				oViewModel.setProperty("/plannedLabourCost", oPlannedLabourValues.cost);
				oActualLabourValues = this.getActualLabourValues(oTask);
				oViewModel.setProperty("/actualLabourHours", oActualLabourValues.hours);
				oViewModel.setProperty("/actualLabourCost", oActualLabourValues.cost);
			}
		},

		crewMembersFormatter: function (aCrewMembers) {
			var sTooltip = "",
				oModel = this.getModel(),
				oBC;

			if (!aCrewMembers) {
				return sTooltip;
			}
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
			if (aCrewMembers) {
				return aCrewMembers.length;
			} else {
				return 0;
			}
		},

		setStaffingStatus: function () {
			var oModel = this.getModel(),
				oTaskBC = this.getView().getBindingContext(),
				aAssignedWorkers = oTaskBC.getProperty("workers") || [],
				oWorkerBC,
				aAssignedCrews = oTaskBC.getProperty("crews") || [],
				aCrewSkills,
				aWorkerSkills = [],
				i, j,
				iSkillsMatched = 0,
				sIconColor,
				that = this;

			this.getRequiredSkills().then(function (aRequiredSkills) {
				// collect skills from all workers
				aAssignedCrews.forEach(function (oCrew) {
					if (oCrew) {
						aCrewSkills = that.getCrewMemberSkills(oCrew);
						for (i = 0; i < aCrewSkills.length; i++) {
							aWorkerSkills.push(aCrewSkills[i]);
						}
					}
				});
				aAssignedWorkers.forEach(function (oWorkerForTask) {
					if (oWorkerForTask) {
						oWorkerBC = oModel.createBindingContext("/" + oWorkerForTask + "/worker");
						aWorkerSkills.push(that.getPersonSkill(oWorkerBC.getPath()));
					}
				});
				// compare required with assigned skills
				// sort so that least experience will be checked first
				aWorkerSkills = aWorkerSkills.sort(function (a, b) {
					return (b.profession + b.discipline + b.experience) - (a.profession + a.discipline + a.experience);
				});
				for (i = 0; i < aRequiredSkills.length; i++) {
					for (j = 0; j < aWorkerSkills.length; j++) {
						if (!aWorkerSkills[j].crewSkillMatched) { // don't check if already succeeded in a match
							if (aRequiredSkills[i].profession === aWorkerSkills[j].profession &&
								aRequiredSkills[i].discipline === aWorkerSkills[j].discipline &&
								aRequiredSkills[i].experience >= aWorkerSkills[j].experience) {
								iSkillsMatched += 1;
								aWorkerSkills[j].crewSkillMatched = true;
								break;
							}
						}
					}
				}
				if (iSkillsMatched >= aRequiredSkills.length) {
					sIconColor = sap.ui.core.IconColor.Positive;
				} else if (iSkillsMatched === 0) {
					sIconColor = sap.ui.core.IconColor.Negative;
				} else {
					sIconColor = sap.ui.core.IconColor.Critical;
				}
				that.byId("taskIconTabFilterWorkers").setIconColor(sIconColor);
			});
		},

		getPersonSkill: function (sPersonPath) {
			var oPersonSkill,
				oPersonBC = sPersonPath.startsWith("/") ?
				this.getModel().createBindingContext(sPersonPath) : this.getModel().createBindingContext("/" + sPersonPath);

			if (oPersonBC) {
				oPersonSkill = {
					profession: oPersonBC.getProperty("profession/description"),
					discipline: oPersonBC.getProperty("profession/discipline/code"),
					experience: oPersonBC.getProperty("experience/code"),
					crewSkillMatched: false
				};
			}
			return oPersonSkill;
		},

		getCrewMemberSkills: function (sCrewPath) {
			var aCrewSkills = [],
				oCrewBC = this.getModel().createBindingContext("/" + sCrewPath),
				aCrewMemberPaths = oCrewBC.getProperty("crew/crewMembers") || [],
				that = this;

			if (aCrewMemberPaths && aCrewMemberPaths.length) {
				aCrewMemberPaths.forEach(function (sPersonPath) {
					if (sPersonPath) {
						aCrewSkills.push(that.getPersonSkill(sPersonPath));
					}
				});
			}
			return aCrewSkills;
		},

		getRequiredSkills: function () {
			var oModel = this.getModel(),
				sTaskPath = this.getView().getBindingContext().getPath() + "/recipe/requiredSkills",
				aRequiredSkills = [],
				sProfession,
				sDiscipline,
				sExperience;

			return new Promise(function (resolve) {
				oModel.read(sTaskPath, {
					urlParameters: {
						$expand: "skill, skill/profession, skill/profession/discipline, skill/experience"
					},
					success: function (oData) {
						if (oData.results.length > 0) {
							for (var i = 0; i < oData.results.length; i++) {
								sProfession = oData.results[i].skill.profession.description;
								sDiscipline = (oData.results[i].skill.profession.discipline_ID) ? oData.results[i].skill.profession.discipline.code :
									null;
								sExperience = oData.results[i].skill.experience.code;
								aRequiredSkills.push({
									profession: sProfession,
									discipline: sDiscipline,
									experience: sExperience,
									skillMatched: false
								});
							}
							resolve(aRequiredSkills);
						}
					},
					error: function (oError) {
						resolve(aRequiredSkills);
					}
				});
			});
		},

		indicateSkillCoverage: function (aSkillItems) {
			var oModel = this.getModel(),
				oTaskBC = this.getView().getBindingContext(),
				aAssignedWorkers = oTaskBC.getProperty("workers") || [],
				oWorkerBC,
				aAssignedCrews = oTaskBC.getProperty("crews") || [],
				aCrewSkills,
				aWorkerSkills = [],
				aRequiredSkills = [],
				i, j,
				sProfession,
				sDiscipline,
				sExperience,
				that = this;

			aSkillItems.forEach(function (oSkillItem) {
				sProfession = oSkillItem.getBindingContext().getProperty("skill/profession/description");
				sDiscipline = oSkillItem.getBindingContext().getProperty("skill/profession/discipline/code");
				sExperience = oSkillItem.getBindingContext().getProperty("skill/experience/code");
				aRequiredSkills.push({
					profession: sProfession,
					discipline: sDiscipline,
					experience: sExperience,
					skillMatched: false
				});
			});

			// collect skills from all workers
			aAssignedCrews.forEach(function (oCrew) {
				if (oCrew) {
					aCrewSkills = that.getCrewMemberSkills(oCrew);
					for (i = 0; i < aCrewSkills.length; i++) {
						aWorkerSkills.push(aCrewSkills[i]);
					}
				}
			});
			aAssignedWorkers.forEach(function (oWorkerForTask) {
				if (oWorkerForTask) {
					oWorkerBC = oModel.createBindingContext("/" + oWorkerForTask + "/worker");
					aWorkerSkills.push(that.getPersonSkill(oWorkerBC.getPath()));
				}
			});
			// compare required with assigned skills
			// sort so that least experience will be checked first
			aWorkerSkills = aWorkerSkills.sort(function (a, b) {
				return (b.profession + b.discipline + b.experience) - (a.profession + a.discipline + a.experience);
			});
			for (i = 0; i < aRequiredSkills.length; i++) {
				aSkillItems[i].setHighlight(sap.ui.core.MessageType.Error);
				for (j = 0; j < aWorkerSkills.length; j++) {
					if (!aWorkerSkills[j].crewSkillMatched) { // don't check if already succeeded in a match
						if (aRequiredSkills[i].profession === aWorkerSkills[j].profession &&
							aRequiredSkills[i].discipline === aWorkerSkills[j].discipline &&
							aRequiredSkills[i].experience >= aWorkerSkills[j].experience) {
							aSkillItems[i].setHighlight(sap.ui.core.MessageType.Success);
							aWorkerSkills[j].crewSkillMatched = true;
							break;
						}
					}
				}
			}
		},

		//////////////////////////////////////// ADD CREWS ////////////////////////////////////

		_getInitialExistingCrewFilters: function () {
			var aExistingCrews = this.byId("taskCrewsList").getItems(),
				sProjectID = this.getModel("appView").getProperty("/selectedProjectID"),
				sCrewID,
				aFilters = [];

			// exclude existing crew assignments from crew selection list
			for (var i = 0; i < aExistingCrews.length; i++) {
				// sCrewID === crew_ID of /CrewsForTasks === id of /Crews
				// listBinding of taskAddCrewssList === /Crews
				sCrewID = aExistingCrews[i].getBindingContext().getObject().crew_ID;
				aFilters.push(new Filter("ID", sap.ui.model.FilterOperator.NE, sCrewID));
			}
			// only crews of the current project: found in WorkerDeployments 
			aFilters.push(new Filter("project_ID", sap.ui.model.FilterOperator.EQ, sProjectID));

			return aFilters;
		},

		onAddCrew: function () {
			this._createCrewDialog();

			var oFrag = sap.ui.core.Fragment,
				oAddCrewList = oFrag.byId("addCrewFrag", "taskAddCrewsList"),
				oSkillsList = oFrag.byId("addCrewFrag", "requiredSkillsList"),
				aFilters = [];

			aFilters = this._getInitialExistingCrewFilters();
			oAddCrewList.getBinding("items").filter(new Filter({
				filters: aFilters,
				and: true
			}));
			this.oAddCrewDialog.getButtons()[0].setEnabled(false);
			oFrag.byId("addCrewFrag", "availableSwitch").setState(false);
			oFrag.byId("addCrewFrag", "infoToolbarForCrew").setVisible(false);
			oAddCrewList.removeSelections(true);
			this.indicateSkillCoverage(oSkillsList.getItems());
			this.oAddCrewDialog.open();
		},

		_indicateSuitableCrews: function () {
			var oFrag = sap.ui.core.Fragment,
				aAddCrewListItems = oFrag.byId("addCrewFrag", "taskAddCrewsList").getItems(),
				aSkillItems = oFrag.byId("addCrewFrag", "requiredSkillsList").getItems(),
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

		onSwitchAvailableCrews: function (oEvent) {
			// search availability by date switched on/off
			var bSwitchOn = oEvent.getParameter("state"),
				oFrag = sap.ui.core.Fragment,
				oStartDatePicker = oFrag.byId("addCrewFrag", "startDatePickerForCrew"),
				oInfoToolbar = oFrag.byId("addCrewFrag", "infoToolbarForCrew"),
				oTask = this.getView().getBindingContext().getObject();

			if (oStartDatePicker.getValueState() === "Error") {
				return;
			}
			if (oTask.status > 1) {
				oStartDatePicker.setDateValue(oTask.actualStart);
			} else {
				oStartDatePicker.setDateValue(oTask.plannedStart);
			}
			oInfoToolbar.setVisible(bSwitchOn);
			if (!bSwitchOn) {
				this.getModel("taskView").setProperty("/busyCrewFilters", undefined);
				this._refreshCrewList();
			} else {
				this.onCrewSearchDateChanged(); // includes build (initial) busyWorkerFilters and refresh
			}
		},

		onCrewSearchDateChanged: function () {
			// create filters for crews who are busy 
			var oFrag = sap.ui.core.Fragment,
				oStartDatePicker = oFrag.byId("addCrewFrag", "startDatePickerForCrew"),
				oStartDate = oStartDatePicker.getDateValue(),
				oEndDatePicker = oFrag.byId("addCrewFrag", "endDatePickerForCrew"),
				oEndDate = oEndDatePicker.getDateValue(),
				oModel = this.getModel(),
				oViewModel = this.getModel("taskView"),
				sProjectID = this.getModel("appView").getProperty("/selectedProjectID"),
				oProjectFilter,
				sCurrentTaskID = this.getView().getBindingContext().getObject().ID,
				oExcludeCurrentTaskFilter,
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
			oExcludeCurrentTaskFilter = new Filter("ID", sap.ui.model.FilterOperator.NE, sCurrentTaskID);
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
				filters: [oProjectFilter, oExcludeCurrentTaskFilter, oTaskFilter],
				and: true,
				success: function (oData) {
					// then find all crews for these tasks
					if (oData.results.length > 0) {
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

		onAddCrewSelectionChange: function () {
			var oFrag = sap.ui.core.Fragment,
				oCrewList = oFrag.byId("addCrewFrag", "taskAddCrewsList");

			this.oAddCrewDialog.getButtons()[0].setEnabled(oCrewList.getSelectedItems().length > 0);
		},

		_createCrewDialog: function () {
			var oFrag = sap.ui.core.Fragment,
				that = this,
				oModel = this.getModel(),
				oViewModel = this.getView().getModel("taskView"),
				sProjectID = this.getModel("appView").getProperty("/selectedProjectID"),
				//sTaskID = oViewModel.getProperty("/taskID"),
				sTitle = this.getResourceBundle().getText("taskAddCrewTitle"),
				sAdd = this.getResourceBundle().getText("addButtonText"),
				sCancel = this.getResourceBundle().getText("cancelButtonText"),
				aSelectedCrewItems = [],
				sCrewID;

			if (!this.oAddCrewDialog) {
				this.oAddCrewDialog = new Dialog({
					title: sTitle,
					contentWidth: "700px",
					draggable: true,
					resizable: true,
					content: [
						sap.ui.xmlfragment("addCrewFrag", "cockpit.Cockpit.view.AddCrew", this)
					],
					buttons: [{
						text: sAdd,
						enabled: false,
						visible: true,
						press: function () {
							aSelectedCrewItems = oFrag.byId("addCrewFrag", "taskAddCrewsList").getSelectedItems();
							for (var i = 0; i < aSelectedCrewItems.length; i++) {
								sCrewID = aSelectedCrewItems[i].getBindingContext().getObject().ID;
								oModel.createEntry("/CrewsForTask", {
									properties: {
										project_ID: sProjectID,
										crew_ID: sCrewID,
										task_ID: oViewModel.getProperty("/taskID")
									}
								});
							}
							oModel.submitChanges({
								success: function (oData) {
									Log.info("CrewsForTask create success:" + JSON.stringify(oData));
								},
								error: function (oError) {
									Log.error("crewsForTask create error:" + JSON.stringify(oError));
								}
							});
							that.oAddCrewDialog.close();
						}
					}, {
						text: sCancel,
						enabled: true,
						press: function () {
							that.oAddCrewDialog.close();
						}
					}]
				});
				this.oAddCrewDialog.addStyleClass("sapUiContentPadding");
				this.getView().addDependent(this.oAddCrewDialog);
			}
		},

		_refreshCrewList: function () {
			var oFrag = sap.ui.core.Fragment,
				oCrewList = oFrag.byId("addCrewFrag", "taskAddCrewsList"),
				oSkillsList = oFrag.byId("addCrewFrag", "requiredSkillsList"),
				aFilters = this._getInitialExistingCrewFilters(),
				//aSkillFilters = this.getModel("taskView").getProperty("/skillFilters"),
				aBusyCrewFilters = this.getModel("taskView").getProperty("/busyCrewFilters");

			if (aBusyCrewFilters && aBusyCrewFilters.length > 0) {
				for (var i = 0; i < aBusyCrewFilters.length; i++) {
					aFilters.push(aBusyCrewFilters[i]);
				}
			}
			oCrewList.getBinding("items").filter(new Filter({
				filters: aFilters,
				and: true
			}));
			this.indicateSkillCoverage(oSkillsList.getItems());
		},

		onSkillsListForCrewUpdateFinished: function (oEvent) {
			var oFrag = sap.ui.core.Fragment,
				oSkillsList = oFrag.byId("addCrewFrag", "requiredSkillsList"),
				sTitle,
				iTotalItems = oEvent.getParameter("total"),
				oViewModel = this.getModel("taskView");

			// only update the counter if the length is final
			if (oSkillsList.getBinding("items").isLengthFinal()) {
				if (iTotalItems) {
					sTitle = this.getResourceBundle().getText("skillsListForCrewTitle", [iTotalItems]);
				} else {
					sTitle = this.getResourceBundle().getText("skillsListForCrewTitleEmpty");
				}
				oViewModel.setProperty("/skillsForCrewListTitle", sTitle);
				// show which skills are covered by already assigned workforce (workers and crews)
				this.indicateSkillCoverage(oSkillsList.getItems());
			}
		},

		onAddCrewListUpdateFinished: function (oEvent) {
			var oFrag = sap.ui.core.Fragment,
				oCrewList = oFrag.byId("addCrewFrag", "taskAddCrewsList"),
				sTitle,
				iTotalItems = oEvent.getParameter("total"),
				oViewModel = this.getModel("taskView");

			// only update the counter if the length is final
			if (oCrewList.getBinding("items").isLengthFinal()) {
				if (iTotalItems) {
					sTitle = this.getResourceBundle().getText("taskAddCrewTableHeadingCount", [iTotalItems]);
				} else {
					sTitle = this.getResourceBundle().getText("taskAddCrewTableHeading");
				}
				oViewModel.setProperty("/addCrewItemListTitle", sTitle);
				this._indicateSuitableCrews();
			}
		},

		//////////////////////////////////////// ADD WORKERS ////////////////////////////////////

		_getInitialExistingWorkerFilters: function () {
			var aExistingWorkers = this.byId("taskWorkersList").getItems(),
				sProjectID = this.getModel("appView").getProperty("/selectedProjectID"),
				sWorkerID,
				aFilters = [];

			// exclude existing worker assignments from worker selection list
			for (var i = 0; i < aExistingWorkers.length; i++) {
				// sWorkerID === worker_ID of /WorkersForTasks === id of /Persons
				// listBinding of taskAddWorkersList === /Persons
				sWorkerID = aExistingWorkers[i].getBindingContext().getObject().worker_ID;
				aFilters.push(new Filter("ID", sap.ui.model.FilterOperator.NE, sWorkerID));
			}
			// only crews of the current project: found in WorkerDeployments 
			aFilters.push(new Filter("deployment/project_ID", sap.ui.model.FilterOperator.EQ, sProjectID));
			// worker also must not be assigned to a crew
			aFilters.push(new Filter("memberOfCrew_ID", sap.ui.model.FilterOperator.EQ, null));

			return aFilters;
		},

		onAddWorker: function () {
			var oFrag = sap.ui.core.Fragment,
				oAddWorkerList,
				oSkillsList,
				aFilters;

			this._createWorkerDialog();
			oAddWorkerList = oFrag.byId("addWorkerFrag", "taskAddWorkersList");
			oSkillsList = oFrag.byId("addWorkerFrag", "requiredSkillsList");
			aFilters = this._getInitialExistingWorkerFilters();
			oAddWorkerList.getBinding("items").filter(new Filter({
				filters: aFilters,
				and: true
			}));
			oFrag.byId("addWorkerFrag", "dateRangeSwitch").setState(false);
			oFrag.byId("addWorkerFrag", "infoToolbar").setVisible(false);
			oFrag.byId("addWorkerFrag", "clearSkillFilterButton").setEnabled(false);
			this.indicateSkillCoverage(oSkillsList.getItems());
			this.oAddWorkerDialog.open();
		},

		onSwitchPressed: function (oEvent) {
			var bSwitchOn = oEvent.getParameter("state"),
				oFrag = sap.ui.core.Fragment,
				oStartDatePicker = oFrag.byId("addWorkerFrag", "startDatePicker"),
				oInfoToolbar = oFrag.byId("addWorkerFrag", "infoToolbar"),
				oTask = this.getView().getBindingContext().getObject();

			if (oStartDatePicker.getValueState() === "Error") {
				return;
			}
			if (oTask.status > 1) {
				oStartDatePicker.setDateValue(oTask.actualStart);
			} else {
				oStartDatePicker.setDateValue(oTask.plannedStart);
			}
			oInfoToolbar.setVisible(bSwitchOn);
			if (!bSwitchOn) {
				this.getModel("taskView").setProperty("/busyWorkerFilters", undefined);
				this._refreshWorkerList();
			} else {
				this.onWorkerSearchDateChanged(); // build (initial) busyWorkerFilters and refresh
			}
		},

		onWorkerSearchDateChanged: function () {
			// create filters for workers who are busy 
			var oFrag = sap.ui.core.Fragment,
				oStartDatePicker = oFrag.byId("addWorkerFrag", "startDatePicker"),
				oStartDate = oStartDatePicker.getDateValue(),
				oEndDatePicker = oFrag.byId("addWorkerFrag", "endDatePicker"),
				oEndDate = oEndDatePicker.getDateValue(),
				oModel = this.getModel(),
				oViewModel = this.getModel("taskView"),
				sProjectID = this.getModel("appView").getProperty("/selectedProjectID"),
				oProjectFilter,
				sCurrentTaskID = this.getView().getBindingContext().getObject().ID,
				oExcludeCurrentTaskFilter,
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
			oExcludeCurrentTaskFilter = new Filter("ID", sap.ui.model.FilterOperator.NE, sCurrentTaskID);
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
				filters: [oProjectFilter, oExcludeCurrentTaskFilter, oTaskFilter],
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
								Log.info("WorkersForTask read for busy workers:" + JSON.stringify(oData.results));
								if (oWorkers.results.length > 0) {
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

		onAddWorkerSelectionChange: function () {
			var oFrag = sap.ui.core.Fragment,
				bAddEnabled = oFrag.byId("addWorkerFrag", "taskAddWorkersList").getSelectedItems().length > 0;

			this.oAddWorkerDialog.getButtons()[0].setEnabled(bAddEnabled);
		},

		_createWorkerDialog: function () {
			var that = this,
				oFrag = sap.ui.core.Fragment,
				oViewModel = this.getModel("taskView"),
				oModel = this.getModel(),
				sTitle = this.getResourceBundle().getText("taskAddWorkerTitle"),
				sAdd = this.getResourceBundle().getText("addButtonText"),
				sCancel = this.getResourceBundle().getText("cancelButtonText"),
				sProjectID = this.getModel("appView").getProperty("/selectedProjectID"),
				sTaskID = this.getView().getBindingContext().getProperty("ID"),
				aSelectedWorkerItems,
				sWorkerID;

			oViewModel.setProperty("/taskID", sTaskID); // should have been set at objectMatched
			if (!this.oAddWorkerDialog) {
				this.oAddWorkerDialog = new Dialog({
					title: sTitle,
					contentWidth: "750px",
					draggable: true,
					resizable: true,
					content: [
						sap.ui.xmlfragment("addWorkerFrag", "cockpit.Cockpit.view.AddWorker", this)
					],
					buttons: [{
						text: sAdd,
						enabled: false,
						press: function () {
							aSelectedWorkerItems = oFrag.byId("addWorkerFrag", "taskAddWorkersList").getSelectedItems();
							that.oAddWorkerDialog.close();
							for (var i = 0; i < aSelectedWorkerItems.length; i++) {
								sWorkerID = aSelectedWorkerItems[i].getBindingContext().getObject().ID;
								oModel.createEntry("/WorkersForTask", {
									properties: {
										project_ID: sProjectID,
										worker_ID: sWorkerID,
										task_ID: sTaskID
									}
								});
							}
							oModel.submitChanges({
								success: function (oData) {
									Log.info("WorkersForTask Creation:" + JSON.stringify(oData.results));
								},
								error: function (oError) {
									Log.error("WorkersForTask Creation:" + JSON.stringify(oError));
								}
							});
							oViewModel.setProperty("/skillFilters", undefined);
							oFrag.byId("addWorkerFrag", "requiredSkillsList").removeSelections(true);
						}
					}, {
						text: sCancel,
						enabled: true,
						press: function () {
							that.oAddWorkerDialog.close();
							oViewModel.setProperty("/skillFilters", undefined);
							oFrag.byId("addWorkerFrag", "requiredSkillsList").removeSelections(true);
						}
					}]
				});
				this.oAddWorkerDialog.addStyleClass("sapUiContentPadding");
				this.getView().addDependent(this.oAddWorkerDialog);
			}
		},

		_refreshWorkerList: function () {
			var oFrag = sap.ui.core.Fragment,
				oWorkerList = oFrag.byId("addWorkerFrag", "taskAddWorkersList"),
				oSkillsList = oFrag.byId("addWorkerFrag", "requiredSkillsList"),
				aFilters = this._getInitialExistingWorkerFilters(),
				aSkillFilters = this.getModel("taskView").getProperty("/skillFilters"),
				aBusyWorkerFilters = this.getModel("taskView").getProperty("/busyWorkerFilters");

			if (aSkillFilters && aSkillFilters.length > 0) {
				for (var i = 0; i < aSkillFilters.length; i++) {
					aFilters.push(aSkillFilters[i]);
				}
				//aFilters.concat(aSkillFilters); doesn't work
			}
			if (aBusyWorkerFilters && aBusyWorkerFilters.length > 0) {
				for (i = 0; i < aBusyWorkerFilters.length; i++) {
					aFilters.push(aBusyWorkerFilters[i]);
				}
			}
			oWorkerList.getBinding("items").filter(new Filter({
				filters: aFilters,
				and: true
			}));
			this.indicateSkillCoverage(oSkillsList.getItems());
		},

		onSkillSelectionChange: function (oEvent) {
			// creates the skillFilters
			var oItemBC = oEvent.getParameter("listItem").getBindingContext(),
				aSkillFilters = [
					new Filter("profession/description", sap.ui.model.FilterOperator.EQ, oItemBC.getProperty("skill/profession/description")),
					new Filter("profession/discipline/code", sap.ui.model.FilterOperator.EQ, oItemBC.getProperty("skill/profession/discipline/code")),
					new Filter("experience/code", sap.ui.model.FilterOperator.LE, oItemBC.getProperty("skill/experience/code"))
				],
				oFrag = sap.ui.core.Fragment,
				oSkillClearFilterButton = oFrag.byId("addWorkerFrag", "clearSkillFilterButton");

			this.getModel("taskView").setProperty("/skillFilters", aSkillFilters);
			oSkillClearFilterButton.setEnabled(true);
			this._refreshWorkerList();
		},

		onClearSkillFilter: function () {
			var oFrag = sap.ui.core.Fragment;

			oFrag.byId("addWorkerFrag", "clearSkillFilterButton").setEnabled(false);
			oFrag.byId("addWorkerFrag", "requiredSkillsList").removeSelections(true);
			this.getModel("taskView").setProperty("/skillFilters", undefined);
			this._refreshWorkerList();
		},

		onSkillsListUpdateFinished: function (oEvent) {
			var oFrag = sap.ui.core.Fragment,
				oSkillsList = oFrag.byId("addWorkerFrag", "requiredSkillsList"),
				sTitle,
				iTotalItems = oEvent.getParameter("total"),
				oViewModel = this.getModel("taskView");

			// only update the counter if the length is final
			if (oSkillsList.getBinding("items").isLengthFinal()) {
				if (iTotalItems) {
					sTitle = this.getResourceBundle().getText("skillsListTitle", [iTotalItems]);
				} else {
					sTitle = this.getResourceBundle().getText("skillsListTitleEmpty");
				}
				oViewModel.setProperty("/skillsListTitle", sTitle);
				this.indicateSkillCoverage(oSkillsList.getItems());
			}
		},

		onAddWorkerListUpdateFinished: function (oEvent) {
			var oFrag = sap.ui.core.Fragment,
				oWorkerList = oFrag.byId("addWorkerFrag", "taskAddWorkersList"),
				oSkillsList = oFrag.byId("addWorkerFrag", "requiredSkillsList"),
				sTitle,
				iTotalItems = oEvent.getParameter("total"),
				oViewModel = this.getModel("taskView");

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
				oViewModel.setProperty("/addWorkerItemListTitle", sTitle);
			}
		},

		/////////////////////////////////////////// LABOR CHART POPOVER /////////////////////////

		onLaborChart: function (oEvent) {
			var oFrag = sap.ui.core.Fragment,
				oButton = oEvent.getSource(),
				oView = this.getView(),
				that = this;

			if (!this._laborChartPopover) {
				this._laborChartPopover = oFrag.load({
					id: oView.getId(),
					name: "cockpit.Cockpit.view.LaborChart",
					controller: this
				}).then(function (oPopover) {
					oView.addDependent(oPopover);
					//oPopover.bindElement("/ProductCollection/0");
					return oPopover;
				});
			}
			this._laborChartPopover.then(function (oPopover) {
				that.setLaborChartValues();
				oPopover.openBy(oButton);
			});
		},

		setLaborChartValues: function () {
			var oFrag = sap.ui.core.Fragment,
				oTaskView = this.getModel("taskView"),
				oView = this.getView(),
				mQuantity = oView.getBindingContext().getProperty("quantity"),
				mActualQuantity = oTaskView.getProperty("/cumulativeQuantity"),
				oTotalHrsChart = oFrag.byId(oView.getId(), "totalHrs"),
				oTotalCostChart = oFrag.byId(oView.getId(), "totalCost"),
				mKPIHours = oTaskView.getProperty("/actualLabourHours") / oTaskView.getProperty("/plannedLabourHours") || 0,
				// if more quantity than planned was performed then hrs and cost KPI can differ
				mKPICost = oTaskView.getProperty("/actualLabourCost") / oTaskView.getProperty("/plannedLabourCost") || 0,
				sHours, sCost;

			// total hours
			if (oTaskView.getProperty("/plannedLabourHours")) {
				oTotalHrsChart.getColumns()[0].setValue(Number(oTaskView.getProperty("/plannedLabourHours")));
				sHours = formatter.hoursToHoursMinutes(Number(oTaskView.getProperty("/plannedLabourHours")));
			} else {
				oTotalHrsChart.getColumns()[0].setValue(0);
				sHours = "0";
			}
			oTotalHrsChart.setLeftTopLabel(oTotalHrsChart.getLeftTopLabel().setLabel(sHours));
			if (oTaskView.getProperty("/actualLabourHours")) {
				oTotalHrsChart.getColumns()[1].setValue(Number(oTaskView.getProperty("/actualLabourHours")));
				oTotalHrsChart.getColumns()[1].setColor(mKPIHours >= 1.0 ? sap.m.ValueColor.Error : sap.m.ValueColor.Good);
				sHours = formatter.hoursToHoursMinutes(oTaskView.getProperty("/actualLabourHours"));
			} else {
				oTotalHrsChart.getColumns()[1].setValue(0);
				sHours = "0";
			}
			oTotalHrsChart.setRightTopLabel(oTotalHrsChart.getRightTopLabel().setLabel(sHours));
			// hrs per UoM
			oTotalHrsChart = oFrag.byId(oView.getId(), "totalHrsPerUoM");
			if (oTaskView.getProperty("/plannedLabourHours")) {
				oTotalHrsChart.getColumns()[0].setValue(Number(oTaskView.getProperty("/plannedLabourHours") / mQuantity));
				sHours = formatter.hoursToHoursMinutes(oTaskView.getProperty("/plannedLabourHours") / mQuantity);
			} else {
				oTotalHrsChart.getColumns()[0].setValue(0);
				sHours = "0";
			}
			oTotalHrsChart.setLeftTopLabel(oTotalHrsChart.getLeftTopLabel().setLabel(sHours));
			if (oTaskView.getProperty("/actualLabourHours") && mActualQuantity) {
				oTotalHrsChart.getColumns()[1].setValue(Number(oTaskView.getProperty("/actualLabourHours") / mActualQuantity));
				oTotalHrsChart.getColumns()[1].setColor(mKPIHours >= 1.0 ? sap.m.ValueColor.Error : sap.m.ValueColor.Good);
				sHours = formatter.hoursToHoursMinutes(oTaskView.getProperty("/actualLabourHours") / mActualQuantity);
			} else {
				oTotalHrsChart.getColumns()[1].setValue(0);
				sHours = "0";
			}
			oTotalHrsChart.setRightTopLabel(oTotalHrsChart.getRightTopLabel().setLabel(sHours));
			// total cost
			if (oTaskView.getProperty("/plannedLabourCost")) {
				oTotalCostChart.getColumns()[0].setValue(Number(oTaskView.getProperty("/plannedLabourCost")));
				sCost = formatter.currencyValue(oTaskView.getProperty("/plannedLabourCost"));
			} else {
				oTotalCostChart.getColumns()[0].setValue(0);
				sCost = "0";
			}
			oTotalCostChart.setLeftTopLabel(oTotalCostChart.getLeftTopLabel().setLabel(sCost));
			if (oTaskView.getProperty("/actualLabourCost")) {
				oTotalCostChart.getColumns()[1].setValue(Number(oTaskView.getProperty("/actualLabourCost")));
				oTotalCostChart.getColumns()[1].setColor(mKPIHours >= 1.0 ? sap.m.ValueColor.Error : sap.m.ValueColor.Good);
				sCost = formatter.currencyValue(oTaskView.getProperty("/actualLabourCost"));
			} else {
				oTotalCostChart.getColumns()[1].setValue(0);
				sCost = "0";
			}
			oTotalCostChart.setRightTopLabel(oTotalCostChart.getRightTopLabel().setLabel(sCost));
			// cost per UoM
			oTotalCostChart = oFrag.byId(oView.getId(), "totalCostPerUoM");
			if (oTaskView.getProperty("/plannedLabourCost")) {
				oTotalCostChart.getColumns()[0].setValue(Number(oTaskView.getProperty("/plannedLabourCost") / mQuantity));
				sCost = formatter.currencyValue(oTaskView.getProperty("/plannedLabourCost") / mQuantity);
			} else {
				oTotalCostChart.getColumns()[0].setValue(0);
				sCost = "0";
			}
			oTotalCostChart.setLeftTopLabel(oTotalCostChart.getLeftTopLabel().setLabel(sCost));
			if (oTaskView.getProperty("/actualLabourCost") && mActualQuantity) {
				oTotalCostChart.getColumns()[1].setValue(Number(oTaskView.getProperty("/actualLabourCost") / mActualQuantity));
				oTotalCostChart.getColumns()[1].setColor(mKPICost >= 1.0 ? sap.m.ValueColor.Error : sap.m.ValueColor.Good);
				sCost = formatter.currencyValue(oTaskView.getProperty("/actualLabourCost") / mActualQuantity);
			} else {
				oTotalCostChart.getColumns()[1].setValue(0);
				sCost = "0";
			}
			oTotalCostChart.setRightTopLabel(oTotalCostChart.getRightTopLabel().setLabel(sCost));
		},

		/////////////////////////////////////////////////////////////////SUBCONTRACT////////////////////////////////////

		editSubby: function () {
			var oFrag = sap.ui.core.Fragment,
				sProjectID = this.getView().getBindingContext().getProperty("project_ID"),
				sDisciplineID = this.getView().getBindingContext().getProperty("discipline_ID"),
				aSubFilter;

			this._createSubbyEditDialog();
			// filter company list
			aSubFilter = [new Filter({
				filters: [
					new Filter("project_ID", sap.ui.model.FilterOperator.EQ, sProjectID),
					new Filter("discipline_ID", sap.ui.model.FilterOperator.EQ, sDisciplineID)
				],
				and: true
			})];
			oFrag.byId("mySubbyFrag", "selectSubby").getBinding("items").filter(aSubFilter);
			oFrag.byId("mySubbyFrag", "selectSubby").setSelectedKey(this.getView().getBindingContext().getProperty("company_ID"));
			this.oSubbyEditDialog.getButtons()[0].setEnabled(false);
			// when re-opening the dialog it happens that both fields are enabled
			if (this.getView().getBindingContext().getProperty("lumpSum")) {
				oFrag.byId("mySubbyFrag", "unitRate").setEnabled(false);
				oFrag.byId("mySubbyFrag", "plannedCost").setEnabled(true);
			} else {
				oFrag.byId("mySubbyFrag", "unitRate").setEnabled(true);
				oFrag.byId("mySubbyFrag", "plannedCost").setEnabled(false);
			}
			this.oSubbyEditDialog.open();
		},

		handleSubbyChange: function () {
			this._checkSubbySaveEnablement();
		},

		deleteSubby: function () {
			var oModel = this.getModel(),
				oBC = this.getView().getBindingContext();

			oModel.setProperty("price", null, oBC);
			oModel.setProperty("company_ID", null, oBC);
			oModel.setProperty("plannedTotalPrice", null, oBC);
			oModel.setProperty("actualTotalPrice", null, oBC);
			oModel.setProperty("lumpSum", null, oBC);
			oModel.submitChanges({
				error: function (oError) {
					Log.error("Error deleting subcontractor prices");
				}
			});
			this.byId("deleteSubby").setEnabled(false);
		},

		onPriceChange: function (oEvent) {
			var oFrag = sap.ui.core.Fragment,
				sPrice = oEvent.getParameter("value"),
				sPlannedQuantity = oFrag.byId("mySubbyFrag", "plannedQuantity").getValue(),
				sActualQuantity = oFrag.byId("mySubbyFrag", "actualQuantity").getValue();
			// cannot be lump sum
			if (isNaN(sPrice) || Number(sPrice) < 0) {
				oFrag.byId("mySubbyFrag", "unitRate").setValueState("Error");
				oFrag.byId("mySubbyFrag", "unitRate").setValueStateText(this.getResourceBundle().getText("errorPriceInput"));
			} else {
				oFrag.byId("mySubbyFrag", "unitRate").setValueState("None");
				oFrag.byId("mySubbyFrag", "unitRate").setValueStateText("");
				oFrag.byId("mySubbyFrag", "plannedCost").setValue(parseFloat(sPlannedQuantity * sPrice).toFixed(2));
				oFrag.byId("mySubbyFrag", "actualCost").setValue(parseFloat(sActualQuantity * sPrice).toFixed(2));
			}
			this._checkSubbySaveEnablement();
		},

		onPlannedTotalPriceChange: function (oEvent) {
			var oFrag = sap.ui.core.Fragment,
				sTotalPrice = oEvent.getParameter("value"),
				sPlannedQuantity = oFrag.byId("mySubbyFrag", "plannedQuantity").getValue();
			// must be lump sum
			if (isNaN(sTotalPrice) || Number(sTotalPrice) < 0) {
				oFrag.byId("mySubbyFrag", "plannedCost").setValueState("Error");
				oFrag.byId("mySubbyFrag", "plannedCost").setValueStateText(this.getResourceBundle().getText("errorTotalPriceInput"));
			} else {
				oFrag.byId("mySubbyFrag", "plannedCost").setValueState("None");
				oFrag.byId("mySubbyFrag", "plannedCost").setValueStateText("");
				oFrag.byId("mySubbyFrag", "unitRate").setValue(parseFloat(sTotalPrice / sPlannedQuantity).toFixed(2));
				oFrag.byId("mySubbyFrag", "actualCost").setValue(parseFloat(sTotalPrice).toFixed(2));
			}
			this._checkSubbySaveEnablement();
		},

		onLumpSumChanged: function () { // also sets the actual cost
			var oFrag = sap.ui.core.Fragment,
				sActualQuantity = oFrag.byId("mySubbyFrag", "actualQuantity").getValue(),
				sPrice = oFrag.byId("mySubbyFrag", "unitRate").getValue(),
				sPlannedTotalPrice = oFrag.byId("mySubbyFrag", "plannedCost").getValue(),
				bLumpSum = oFrag.byId("mySubbyFrag", "lumpSum").getSelected();

			if (bLumpSum) {
				oFrag.byId("mySubbyFrag", "actualCost").setValue(parseFloat(sPlannedTotalPrice).toFixed(2));
				oFrag.byId("mySubbyFrag", "unitRate").setEnabled(false);
				oFrag.byId("mySubbyFrag", "plannedCost").setEnabled(true);
			} else {
				oFrag.byId("mySubbyFrag", "actualCost").setValue(parseFloat(sActualQuantity * sPrice).toFixed(2));
				oFrag.byId("mySubbyFrag", "unitRate").setEnabled(true);
				oFrag.byId("mySubbyFrag", "plannedCost").setEnabled(false);
			}
			this._checkSubbySaveEnablement();
		},

		_checkSubbySaveEnablement: function () {
			var oFrag = sap.ui.core.Fragment,
				oBC = this.getView().getBindingContext();

			// check for error states and that subby is selected
			if (!oFrag.byId("mySubbyFrag", "selectSubby").getSelectedKey() ||
				oFrag.byId("mySubbyFrag", "unitRate").getValueState() === "Error" ||
				oFrag.byId("mySubbyFrag", "plannedCost").getValueState() === "Error") {
				this.oSubbyEditDialog.getButtons()[0].setEnabled(false);
				return;
			}
			// check if values are changed
			if (oBC.getProperty("company_ID") === oFrag.byId("mySubbyFrag", "selectSubby").getSelectedKey() &&
				oBC.getProperty("price") === parseFloat(oFrag.byId("mySubbyFrag", "unitRate").getValue()).toFixed(3) &&
				oBC.getProperty("plannedTotalPrice") === parseFloat(oFrag.byId("mySubbyFrag", "plannedCost").getValue()).toFixed(3) &&
				oBC.getProperty("lumpSum") === oFrag.byId("mySubbyFrag", "lumpSum").getSelected()) {
				this.oSubbyEditDialog.getButtons()[0].setEnabled(false);
				return;
			}
			this.oSubbyEditDialog.getButtons()[0].setEnabled(true);
		},

		_createSubbyEditDialog: function () {
			var oFrag = sap.ui.core.Fragment,
				that = this,
				oModel = this.getModel(),
				oBC = this.getView().getBindingContext(),
				sTitle = this.getResourceBundle().getText("taskSubbyEditTitle"),
				sCancel = this.getResourceBundle().getText("measurementDialogCancelButtonText"),
				sSave = this.getResourceBundle().getText("measurementDialogSaveButtonText");

			if (!that.oSubbyEditDialog) {

				that.oSubbyEditDialog = new Dialog({
					title: sTitle,
					contentWidth: "35%",
					resizable: true,
					draggable: true,
					content: [
						sap.ui.xmlfragment("mySubbyFrag", "cockpit.Cockpit.view.EditSubby", this)
					],
					buttons: [{
						text: sSave,
						enabled: false,
						press: function () {
							oModel.setProperty("company_ID", oFrag.byId("mySubbyFrag", "selectSubby").getSelectedKey(), oBC);
							oModel.setProperty("price", parseFloat(oFrag.byId("mySubbyFrag", "unitRate").getValue()).toFixed(3), oBC);
							oModel.setProperty("plannedTotalPrice", parseFloat(oFrag.byId("mySubbyFrag", "plannedCost").getValue()).toFixed(3), oBC);
							oModel.setProperty("actualTotalPrice", parseFloat(oFrag.byId("mySubbyFrag", "actualCost").getValue()).toFixed(3), oBC);
							oModel.setProperty("lumpSum", oFrag.byId("mySubbyFrag", "lumpSum").getSelected(), oBC);
							oModel.submitChanges({
								error: function (oError) {
									Log.error("Error updating subcontractor prices");
								}
							});
							that.oSubbyEditDialog.close();
						}
					}, {
						text: sCancel,
						enabled: true,
						press: function () {
							that.oSubbyEditDialog.close();
						}
					}]
				});
				that.oSubbyEditDialog.addStyleClass("sapUiContentPadding");
				that.getView().addDependent(that.oSubbyEditDialog);
			}
		},

		/////////////////////////////////////////////////////////////////QUALITY////////////////////////////////////

		onAddQuality: function () {
			var oFrag = sap.ui.core.Fragment,
				oShortText,
				oQualityType,
				oSeverityType,
				oViewModel = this.getModel("taskView");

			oViewModel.setProperty("/mode", "Create");
			this._createQualityDialog(true);

			oShortText = oFrag.byId("myQualityFrag", "shortText");
			oQualityType = oFrag.byId("myQualityFrag", "qualityType");
			oSeverityType = oFrag.byId("myQualityFrag", "severityType");
			oShortText.setValue("");
			oQualityType.setSelectedKey("");
			oSeverityType.setSelectedKey("");

			this._enableQualityDialogButtons();
			if (this.oQualityDialog) {
				var sTitle = this.getResourceBundle().getText("taskQualityDialogCreateTitle");
				this.oQualityDialog.setTitle(sTitle);
			}
			this.oQualityDialog.open();
		},

		onEditQuality: function (oEvent) {
			var oFrag = sap.ui.core.Fragment,
				oShortText,
				oQualityType,
				oSeverityType,
				aButtons,
				oViewModel = this.getModel("taskView"),
				oQualityBC = oEvent.getSource().getBindingContext(),
				sQualityID = oQualityBC.getProperty("ID"),
				sShortText = oQualityBC.getProperty("shortText"),
				sQualityType = oQualityBC.getProperty("quality_ID"),
				sSeverityType = oQualityBC.getProperty("severity_ID");

			oViewModel.setProperty("/mode", "Edit");
			oViewModel.setProperty("/qualityID", sQualityID);
			this._createQualityDialog(false);

			oShortText = oFrag.byId("myQualityFrag", "shortText");
			oQualityType = oFrag.byId("myQualityFrag", "qualityType");
			oSeverityType = oFrag.byId("myQualityFrag", "severityType");
			aButtons = this.oQualityDialog.getButtons();
			oShortText.setValue(sShortText);
			oQualityType.setSelectedKey(sQualityType);
			oSeverityType.setSelectedKey(sSeverityType);

			this._enableQualityDialogButtons();
			if (this.oQualityDialog) {
				var sTitle = this.getResourceBundle().getText("taskQualityDialogEditTitle");
				this.oQualityDialog.setTitle(sTitle);
			}
			this.oQualityDialog.open();
		},

		handleQualityChange: function () {
			var oFrag = sap.ui.core.Fragment,
				oShortText = oFrag.byId("myQualityFrag", "shortText"),
				sShortText = oShortText.getValue();
			if (sShortText.length === 0) {
				var sValueStateText = this.getResourceBundle().getText("taskQualityEmptyDescription");
				oShortText.setValueState("Error");
				oShortText.setValueStateText(sValueStateText);
			} else {
				oShortText.setValueState("None");
				oShortText.setValueStateText("");
			}
			this._enableQualityDialogButtons();
		},

		_enableQualityDialogButtons: function () {
			var oFrag = sap.ui.core.Fragment,
				oViewModel = this.getView().getModel("taskView"),
				bCreate = oViewModel.getProperty("/mode") === "Create",
				aButtons = this.oQualityDialog.getButtons(),
				sShortText = oFrag.byId("myQualityFrag", "shortText").getValue(),
				sQualityType = oFrag.byId("myQualityFrag", "qualityType").getSelectedKey(),
				sSeverityType = oFrag.byId("myQualityFrag", "severityType").getSelectedKey(),
				bCanCreate = sShortText !== "" && sQualityType !== "" && sSeverityType !== "";
			for (var i = 0; i < 3; i++) {
				aButtons[i].setVisible(false);
				aButtons[i].setEnabled(false);
			}
			if (bCreate) {
				aButtons[0].setVisible(true); //create
				if (bCanCreate) {
					aButtons[0].setEnabled(true);
				}
			} else { // save, delete
				var oModel = this.getModel(),
					sQualityID = oViewModel.getProperty("/qualityID"),
					sQualityPath = this.getModel().createKey("/ProblemCards", {
						ID: sQualityID
					}),
					oQuality = oModel.getObject(sQualityPath, {
						select: "*"
					}),
					bTextChange = oQuality.shortText !== sShortText,
					bQualityChange = oQuality.quality_ID !== sQualityType,
					bSeverityChange = oQuality.severity_ID !== sSeverityType,
					bChange = bTextChange || bQualityChange || bSeverityChange,
					bCanSave = bCanCreate && bChange;
				if (bCanSave) {
					aButtons[1].setVisible(true); // save
					aButtons[1].setEnabled(true);
				}
				aButtons[2].setVisible(true); // delete
				aButtons[2].setEnabled(true);
			}
		},

		_createQualityDialog: function (bCreate) {
			var oFrag = sap.ui.core.Fragment,
				that = this,
				sShortText,
				sQualityType,
				sSeverityType,
				oModel,
				sQualityID,
				sQualityPath,
				oQuality,
				oQualityContext,
				oViewModel = this.getView().getModel("taskView"),
				sProjectID = this.getModel("appView").getProperty("/selectedProjectID"),
				sTaskID = oViewModel.getProperty("/taskID"),
				sTitle = this.getResourceBundle().getText("taskBaseEditTitle"),
				sCancel = this.getResourceBundle().getText("cancelButtonText"),
				sSave = this.getResourceBundle().getText("saveButtonText"),
				sCreate = this.getResourceBundle().getText("createButtonText"),
				sDelete = this.getResourceBundle().getText("deleteButtonText"),
				sConfirmText = this.getResourceBundle().getText("qualityDialogConfirmDeleteText"),
				sConfirmTitle = this.getResourceBundle().getText("qualityDialogConfirmDeleteTitle");

			if (bCreate) {
				sTitle = this.getResourceBundle().getText("taskQualityDialogCreateTitle");
			} else {
				sTitle = this.getResourceBundle().getText("taskQualityDialogEditTitle");
			}

			if (!that.oQualityDialog) {

				that.oQualityDialog = new Dialog({
					title: sTitle,
					content: [
						sap.ui.xmlfragment("myQualityFrag", "cockpit.Cockpit.view.AddQualityCard", this)
					],
					buttons: [{
						text: sCreate,
						enabled: false,
						visible: bCreate,
						press: function () {
							sShortText = oFrag.byId("myQualityFrag", "shortText").getValue();
							sQualityType = oFrag.byId("myQualityFrag", "qualityType").getSelectedKey();
							sSeverityType = oFrag.byId("myQualityFrag", "severityType").getSelectedKey();
							oModel = that.getModel();
							oQualityContext = oModel.createEntry("/ProblemCards", {
								properties: {
									project_ID: sProjectID,
									task_ID: sTaskID,
									shortText: sShortText,
									problemDateTime: new Date(),
									isQuality: true,
									quality_ID: sQualityType,
									severity_ID: sSeverityType
								}
							});
							that.getView().setBindingContext(oQualityContext);
							oModel.submitChanges();
							that.oQualityDialog.close();
						}
					}, {
						text: sSave,
						enabled: false,
						visible: !bCreate,
						press: function () {
							sShortText = oFrag.byId("myQualityFrag", "shortText").getValue();
							sQualityType = oFrag.byId("myQualityFrag", "qualityType").getSelectedKey();
							sSeverityType = oFrag.byId("myQualityFrag", "severityType").getSelectedKey();
							oModel = that.getModel();
							sQualityID = that.getModel("taskView").getProperty("/qualityID");
							sQualityPath = that.getModel().createKey("/ProblemCards", {
								ID: sQualityID
							});
							oQuality = oModel.getObject(sQualityPath, {
								select: "*"
							});
							oQuality.shortText = sShortText;
							oQuality.quality_ID = sQualityType;
							oQuality.severity_ID = sSeverityType;
							oModel.update(sQualityPath, oQuality);
							that.oQualityDialog.close();
						}
					}, {
						text: sDelete,
						enabled: !bCreate,
						press: function () {

							oModel = that.getModel();
							sQualityID = that.getModel("taskView").getProperty("/qualityID");
							sQualityPath = that.getModel().createKey("/ProblemCards", {
								ID: sQualityID
							});
							MessageBox.confirm(
								sConfirmText, {
									icon: MessageBox.Icon.WARNING,
									title: sConfirmTitle,
									actions: [sap.m.MessageBox.Action.OK, sap.m.MessageBox.Action.CANCEL],
									initialFocus: MessageBox.Action.CANCEL,
									onClose: function (sAction) {
										if (sAction === "OK") {
											oModel.remove(sQualityPath);
										}
									}
								}
							);
							that.oQualityDialog.close();
						}
					}, {
						text: sCancel,
						enabled: true,
						press: function () {
							that.oQualityDialog.close();
						}
					}]
				});

				that.oQualityDialog.addStyleClass("sapUiContentPadding");
				that.getView().addDependent(that.oQualityDialog);
			}
		},

		onQualityListUpdateFinished: function (oEvent) {
			var oList = this.getView().byId("taskQualityList"),
				sTitle,
				iTotalItems = oEvent.getParameter("total"),
				oViewModel = this.getModel("taskView");

			// only update the counter if the length is final
			if (oList.getBinding("items").isLengthFinal()) {
				if (iTotalItems) {
					sTitle = this.getResourceBundle().getText("taskQualityTableHeadingCount", [iTotalItems]);
				} else {
					//Display 'Line Items' instead of 'Line items (0)'
					sTitle = this.getResourceBundle().getText("taskQualityTableHeading");
				}
				oViewModel.setProperty("/qualityItemListTitle", sTitle);
				oViewModel.setProperty("/countQualityCards", iTotalItems);
				this.setQualityIconColor();
			}
		},

		setQualityIconColor: function () {
			var aItems = this.byId("taskQualityList").getItems(),
				sIconColor = "Default";

			for (var i = 0; i < aItems.length; i++) {
				if (aItems[i].getBindingContext().getProperty("severity/number") === 1) {
					sIconColor = "Negative";
					break;
				} else {
					sIconColor = "Critical";
				}
			}
			this.byId("taskIconTabFilterQuality").setIconColor(sIconColor);
		},

		/////////////////////////////////////////////////////////////////PROBLEMS////////////////////////////////////

		onAddProblem: function () {
			var oFrag = sap.ui.core.Fragment,
				oShortText,
				oProblemType,
				oSeverityType,
				aButtons,
				oViewModel = this.getModel("taskView");

			oViewModel.setProperty("/mode", "Create");
			this._createProblemDialog(true);

			oShortText = oFrag.byId("myProblemFrag", "shortText");
			oProblemType = oFrag.byId("myProblemFrag", "problemType");
			oSeverityType = oFrag.byId("myProblemFrag", "severityType");
			aButtons = this.oProblemDialog.getButtons();
			oShortText.setValue("");
			oProblemType.setSelectedKey("");
			oSeverityType.setSelectedKey("");

			this._enableProblemDialogButtons();
			if (this.oProblemDialog) {
				var sTitle = this.getResourceBundle().getText("taskProblemDialogCreateTitle");
				this.oProblemDialog.setTitle(sTitle);
			}
			this.oProblemDialog.open();
		},

		onEditProblem: function (oEvent) {
			var oFrag = sap.ui.core.Fragment,
				oShortText,
				oProblemType,
				oSeverityType,
				aButtons,
				oViewModel = this.getModel("taskView"),
				oProblemBC = oEvent.getSource().getBindingContext(),
				sProblemID = oProblemBC.getProperty("ID"),
				sShortText = oProblemBC.getProperty("shortText"),
				sProblemType = oProblemBC.getProperty("problem_ID"),
				sSeverityType = oProblemBC.getProperty("severity_ID");

			oViewModel.setProperty("/mode", "Edit");
			oViewModel.setProperty("/problemID", sProblemID);
			this._createProblemDialog(false);

			oShortText = oFrag.byId("myProblemFrag", "shortText");
			oProblemType = oFrag.byId("myProblemFrag", "problemType");
			oSeverityType = oFrag.byId("myProblemFrag", "severityType");
			aButtons = this.oProblemDialog.getButtons();
			oShortText.setValue(sShortText);
			oProblemType.setSelectedKey(sProblemType);
			oSeverityType.setSelectedKey(sSeverityType);

			this._enableProblemDialogButtons();
			if (this.oProblemDialog) {
				var sTitle = this.getResourceBundle().getText("taskProblemDialogEditTitle");
				this.oProblemDialog.setTitle(sTitle);
			}
			this.oProblemDialog.open();
		},

		handleProblemChange: function () {
			var oFrag = sap.ui.core.Fragment,
				oShortText = oFrag.byId("myProblemFrag", "shortText"),
				sShortText = oShortText.getValue();
			if (sShortText.length === 0) {
				var sValueStateText = this.getResourceBundle().getText("taskQualityEmptyDescription");
				oShortText.setValueState("Error");
				oShortText.setValueStateText(sValueStateText);
			} else {
				oShortText.setValueState("None");
				oShortText.setValueStateText("");
			}
			this._enableProblemDialogButtons();
		},

		_enableProblemDialogButtons: function () {
			var oFrag = sap.ui.core.Fragment,
				oViewModel = this.getView().getModel("taskView"),
				bCreate = oViewModel.getProperty("/mode") === "Create",
				aButtons = this.oProblemDialog.getButtons(),
				sShortText = oFrag.byId("myProblemFrag", "shortText").getValue(),
				sProblemType = oFrag.byId("myProblemFrag", "problemType").getSelectedKey(),
				sSeverityType = oFrag.byId("myProblemFrag", "severityType").getSelectedKey(),
				bCanCreate = sShortText !== "" && sProblemType !== "" && sSeverityType !== "";
			for (var i = 0; i < 3; i++) {
				aButtons[i].setVisible(false);
				aButtons[i].setEnabled(false);
			}
			if (bCreate) {
				aButtons[0].setVisible(true); //create
				if (bCanCreate) {
					aButtons[0].setEnabled(true);
				}
			} else { // save, delete
				var oModel = this.getModel(),
					sProblemID = oViewModel.getProperty("/problemID"),
					sProblemPath = this.getModel().createKey("/ProblemCards", {
						ID: sProblemID
					}),
					oProblem = oModel.getObject(sProblemPath, {
						select: "*"
					}),
					bTextChange = oProblem.shortText !== sShortText,
					bProblemChange = oProblem.problemID !== sProblemType,
					bSeverityChange = oProblem.severity_ID !== sSeverityType,
					bChange = bTextChange || bProblemChange || bSeverityChange,
					bCanSave = bCanCreate && bChange;
				if (bCanSave) {
					aButtons[1].setVisible(true); // save
					aButtons[1].setEnabled(true);
				}
				aButtons[2].setVisible(true); // delete
				aButtons[2].setEnabled(true);
			}
		},

		_createProblemDialog: function (bCreate) {
			var oFrag = sap.ui.core.Fragment,
				that = this,
				sShortText,
				sProblemType,
				sSeverityType,
				oModel,
				sProblemID,
				sProblemPath,
				oProblem,
				oProblemContext,
				oViewModel = this.getView().getModel("taskView"),
				sProjectID = this.getModel("appView").getProperty("/selectedProjectID"),
				sTaskID = oViewModel.getProperty("/taskID"),
				sTitle = "",
				sCancel = this.getResourceBundle().getText("cancelButtonText"),
				sSave = this.getResourceBundle().getText("saveButtonText"),
				sCreate = this.getResourceBundle().getText("createButtonText"),
				sDelete = this.getResourceBundle().getText("deleteButtonText"),
				sConfirmText = this.getResourceBundle().getText("problemDialogConfirmDeleteText"),
				sConfirmTitle = this.getResourceBundle().getText("problemDialogConfirmDeleteTitle");

			if (bCreate) {
				sTitle = this.getResourceBundle().getText("taskProblemDialogCreateTitle");
			} else {
				sTitle = this.getResourceBundle().getText("taskProblemDialogEditTitle");
			}

			if (!that.oProblemDialog) {

				that.oProblemDialog = new Dialog({
					title: sTitle,
					content: [
						sap.ui.xmlfragment("myProblemFrag", "cockpit.Cockpit.view.AddProblemCard", this)
					],
					buttons: [{
						text: sCreate,
						enabled: false,
						visible: bCreate,
						press: function () {
							sShortText = oFrag.byId("myProblemFrag", "shortText").getValue();
							sProblemType = oFrag.byId("myProblemFrag", "problemType").getSelectedKey();
							sSeverityType = oFrag.byId("myProblemFrag", "severityType").getSelectedKey();
							oModel = that.getModel();
							oProblemContext = oModel.createEntry("/ProblemCards", {
								properties: {
									project_ID: sProjectID,
									task_ID: sTaskID,
									shortText: sShortText,
									problemDateTime: new Date(),
									isProblem: true,
									problem_ID: sProblemType,
									severity_ID: sSeverityType
								}
							});
							that.getView().setBindingContext(oProblemContext);
							oModel.submitChanges();
							that.oProblemDialog.close();
						}
					}, {
						text: sSave,
						enabled: false,
						visible: !bCreate,
						press: function () {
							sShortText = oFrag.byId("myProblemFrag", "shortText").getValue();
							sProblemType = oFrag.byId("myProblemFrag", "problemType").getSelectedKey();
							sSeverityType = oFrag.byId("myProblemFrag", "severityType").getSelectedKey();
							oModel = that.getModel();
							sProblemID = that.getModel("taskView").getProperty("/problemID");
							sProblemPath = that.getModel().createKey("/ProblemCards", {
								ID: sProblemID
							});
							oProblem = oModel.getObject(sProblemPath, {
								select: "*"
							});
							oProblem.shortText = sShortText;
							oProblem.problem_ID = sProblemType;
							oProblem.severity_ID = sSeverityType;
							oModel.update(sProblemPath, oProblem);
							that.oProblemDialog.close();
						}
					}, {
						text: sDelete,
						enabled: !bCreate,
						press: function () {

							oModel = that.getModel();
							sProblemID = that.getModel("taskView").getProperty("/problemID");
							sProblemPath = that.getModel().createKey("/ProblemCards", {
								ID: sProblemID
							});
							MessageBox.confirm(
								sConfirmText, {
									icon: MessageBox.Icon.WARNING,
									title: sConfirmTitle,
									actions: [sap.m.MessageBox.Action.OK, sap.m.MessageBox.Action.CANCEL],
									initialFocus: MessageBox.Action.CANCEL,
									onClose: function (sAction) {
										if (sAction === "OK") {
											oModel.remove(sProblemPath);
										}
									}
								}
							);
							that.oProblemDialog.close();
						}
					}, {
						text: sCancel,
						enabled: true,
						press: function () {
							that.oProblemDialog.close();
						}
					}]
				});

				that.oProblemDialog.addStyleClass("sapUiContentPadding");
				that.getView().addDependent(that.oProblemDialog);
			}
		},

		onProblemListUpdateFinished: function (oEvent) {
			var oList = this.getView().byId("taskProblemsList"),
				sTitle,
				iTotalItems = oEvent.getParameter("total"),
				oViewModel = this.getModel("taskView");

			// only update the counter if the length is final
			if (oList.getBinding("items").isLengthFinal()) {
				if (iTotalItems) {
					sTitle = this.getResourceBundle().getText("taskProblemTableHeadingCount", [iTotalItems]);
				} else {
					//Display 'Line Items' instead of 'Line items (0)'
					sTitle = this.getResourceBundle().getText("taskProblemTableHeading");
				}
				oViewModel.setProperty("/problemItemListTitle", sTitle);
				oViewModel.setProperty("/countProblemCards", iTotalItems);
				this.setProblemIconColor();
			}
		},

		setProblemIconColor: function () {
			var aItems = this.byId("taskProblemsList").getItems(),
				sIconColor = "Default";

			for (var i = 0; i < aItems.length; i++) {
				if (aItems[i].getBindingContext().getProperty("severity/number") === 1) {
					sIconColor = "Negative";
					break;
				} else {
					sIconColor = "Critical";
				}
			}
			this.byId("taskIconTabFilterProblems").setIconColor(sIconColor);
		},

		/////////////////////////////////////////////////////////////////Health & Safety////////////////////////////////////

		onAddHnS: function () {
			var oFrag = sap.ui.core.Fragment,
				oShortText,
				oHnSType,
				oSeverityType,
				aButtons,
				oViewModel = this.getModel("taskView");

			oViewModel.setProperty("/mode", "Create");
			this._createHnSDialog(true);

			oShortText = oFrag.byId("myHnSFrag", "shortText");
			oHnSType = oFrag.byId("myHnSFrag", "HnSType");
			oSeverityType = oFrag.byId("myHnSFrag", "severityType");
			aButtons = this.oHnSDialog.getButtons();
			oShortText.setValue("");
			oHnSType.setSelectedKey("");
			oSeverityType.setSelectedKey("");

			this._enableHnSDialogButtons();
			if (this.oHnSDialog) {
				var sTitle = this.getResourceBundle().getText("HnSDialogCreateTitle");
				this.oHnSDialog.setTitle(sTitle);
			}
			this.oHnSDialog.open();
		},

		onEditHnS: function (oEvent) {
			var oFrag = sap.ui.core.Fragment,
				oShortText,
				oHnSType,
				oSeverityType,
				aButtons,
				oViewModel = this.getModel("taskView"),
				oHnSBC = oEvent.getSource().getBindingContext(),
				sHnSID = oHnSBC.getProperty("ID"),
				sShortText = oHnSBC.getProperty("shortText"),
				sHnSType = oHnSBC.getProperty("HealthandSafety_ID"),
				sSeverityType = oHnSBC.getProperty("severity_ID");

			oViewModel.setProperty("/mode", "Edit");
			oViewModel.setProperty("/HnSID", sHnSID);
			this._createHnSDialog(false);

			oShortText = oFrag.byId("myHnSFrag", "shortText");
			oHnSType = oFrag.byId("myHnSFrag", "HnSType");
			oSeverityType = oFrag.byId("myHnSFrag", "severityType");
			aButtons = this.oHnSDialog.getButtons();
			oShortText.setValue(sShortText);
			oHnSType.setSelectedKey(sHnSType);
			oSeverityType.setSelectedKey(sSeverityType);

			this._enableHnSDialogButtons();
			if (this.oHnSDialog) {
				var sTitle = this.getResourceBundle().getText("HnSDialogEditTitle");
				this.oHnSDialog.setTitle(sTitle);
			}
			this.oHnSDialog.open();
		},

		handleHnSChange: function () {
			var oFrag = sap.ui.core.Fragment,
				oShortText = oFrag.byId("myHnSFrag", "shortText"),
				sShortText = oShortText.getValue();
			if (sShortText.length === 0) {
				var sValueStateText = this.getResourceBundle().getText("taskQualityEmptyDescription");
				oShortText.setValueState("Error");
				oShortText.setValueStateText(sValueStateText);
			} else {
				oShortText.setValueState("None");
				oShortText.setValueStateText("");
			}
			this._enableHnSDialogButtons();
		},

		_enableHnSDialogButtons: function () {
			var oFrag = sap.ui.core.Fragment,
				oViewModel = this.getView().getModel("taskView"),
				bCreate = oViewModel.getProperty("/mode") === "Create",
				aButtons = this.oHnSDialog.getButtons(),
				sShortText = oFrag.byId("myHnSFrag", "shortText").getValue(),
				sHnSType = oFrag.byId("myHnSFrag", "HnSType").getSelectedKey(),
				sSeverityType = oFrag.byId("myHnSFrag", "severityType").getSelectedKey(),
				bCanCreate = sShortText !== "" && sHnSType !== "" && sSeverityType !== "";
			for (var i = 0; i < 3; i++) {
				aButtons[i].setVisible(false);
				aButtons[i].setEnabled(false);
			}
			if (bCreate) {
				aButtons[0].setVisible(true); //create
				if (bCanCreate) {
					aButtons[0].setEnabled(true);
				}
			} else { // save, delete
				var oModel = this.getModel(),
					sHnSID = oViewModel.getProperty("/HnSID"),
					sHnSPath = this.getModel().createKey("/ProblemCards", {
						ID: sHnSID
					}),
					oHnS = oModel.getObject(sHnSPath, {
						select: "*"
					}),
					bTextChange = oHnS.shortText !== sShortText,
					bHnSChange = oHnS.HnS_ID !== sHnSType,
					bSeverityChange = oHnS.severity_ID !== sSeverityType,
					bChange = bTextChange || bHnSChange || bSeverityChange,
					bCanSave = bCanCreate && bChange;
				if (bCanSave) {
					aButtons[1].setVisible(true); // save
					aButtons[1].setEnabled(true);
				}
				aButtons[2].setVisible(true); // delete
				aButtons[2].setEnabled(true);
			}
		},

		_createHnSDialog: function (bCreate) {
			var oFrag = sap.ui.core.Fragment,
				that = this,
				sShortText,
				sHnSType,
				sSeverityType,
				oModel,
				sHnSID,
				sHnSPath,
				oHnS,
				oHnSContext,
				oViewModel = this.getView().getModel("taskView"),
				sProjectID = this.getModel("appView").getProperty("/selectedProjectID"),
				sTaskID = oViewModel.getProperty("/taskID"),
				sTitle = "",
				sCancel = this.getResourceBundle().getText("cancelButtonText"),
				sSave = this.getResourceBundle().getText("saveButtonText"),
				sCreate = this.getResourceBundle().getText("createButtonText"),
				sDelete = this.getResourceBundle().getText("deleteButtonText"),
				sConfirmText = this.getResourceBundle().getText("HnSDialogConfirmDeleteText"),
				sConfirmTitle = this.getResourceBundle().getText("HnSDialogConfirmDeleteTitle");

			if (bCreate) {
				sTitle = this.getResourceBundle().getText("HnSDialogCreateTitle");
			} else {
				sTitle = this.getResourceBundle().getText("HnSDialogEditTitle");
			}

			if (!that.oHnSDialog) {

				that.oHnSDialog = new Dialog({
					title: sTitle,
					content: [
						sap.ui.xmlfragment("myHnSFrag", "cockpit.Cockpit.view.AddHnSCard", this)
					],
					buttons: [{
						text: sCreate,
						enabled: false,
						visible: bCreate,
						press: function () {
							sShortText = oFrag.byId("myHnSFrag", "shortText").getValue();
							sHnSType = oFrag.byId("myHnSFrag", "HnSType").getSelectedKey();
							sSeverityType = oFrag.byId("myHnSFrag", "severityType").getSelectedKey();
							oModel = that.getModel();
							oHnSContext = oModel.createEntry("/ProblemCards", {
								properties: {
									project_ID: sProjectID,
									task_ID: sTaskID,
									shortText: sShortText,
									problemDateTime: new Date(),
									isHnS: true,
									HealthandSafety_ID: sHnSType,
									severity_ID: sSeverityType
								}
							});
							that.getView().setBindingContext(oHnSContext);
							oModel.submitChanges();
							that.oHnSDialog.close();
						}
					}, {
						text: sSave,
						enabled: false,
						visible: !bCreate,
						press: function () {
							sShortText = oFrag.byId("myHnSFrag", "shortText").getValue();
							sHnSType = oFrag.byId("myHnSFrag", "HnSType").getSelectedKey();
							sSeverityType = oFrag.byId("myHnSFrag", "severityType").getSelectedKey();
							oModel = that.getModel();
							sHnSID = that.getModel("taskView").getProperty("/HnSID");
							sHnSPath = that.getModel().createKey("/ProblemCards", {
								ID: sHnSID
							});
							oHnS = oModel.getObject(sHnSPath, {
								select: "*"
							});
							oHnS.shortText = sShortText;
							oHnS.HealthandSafety_ID = sHnSType;
							oHnS.severity_ID = sSeverityType;
							oModel.update(sHnSPath, oHnS);
							that.oHnSDialog.close();
						}
					}, {
						text: sDelete,
						enabled: !bCreate,
						press: function () {

							oModel = that.getModel();
							sHnSID = that.getModel("taskView").getProperty("/HnSID");
							sHnSPath = that.getModel().createKey("/ProblemCards", {
								ID: sHnSID
							});
							MessageBox.confirm(
								sConfirmText, {
									icon: MessageBox.Icon.WARNING,
									title: sConfirmTitle,
									actions: [sap.m.MessageBox.Action.OK, sap.m.MessageBox.Action.CANCEL],
									initialFocus: MessageBox.Action.CANCEL,
									onClose: function (sAction) {
										if (sAction === "OK") {
											oModel.remove(sHnSPath);
										}
									}
								}
							);
							that.oHnSDialog.close();
						}
					}, {
						text: sCancel,
						enabled: true,
						press: function () {
							that.oHnSDialog.close();
						}
					}]
				});

				that.oHnSDialog.addStyleClass("sapUiContentPadding");
				that.getView().addDependent(that.oHnSDialog);
			}
		},

		onHnSListUpdateFinished: function (oEvent) {
			var oList = this.byId("taskHnSList"),
				sTitle,
				iTotalItems = oEvent.getParameter("total"),
				oViewModel = this.getModel("taskView");

			// only update the counter if the length is final
			if (oList.getBinding("items").isLengthFinal()) {
				if (iTotalItems) {
					sTitle = this.getResourceBundle().getText("HnSTableHeadingCount", [iTotalItems]);
				} else {
					//Display 'Line Items' instead of 'Line items (0)'
					sTitle = this.getResourceBundle().getText("HnSTableHeading");
				}
				oViewModel.setProperty("/HnSItemListTitle", sTitle);
				oViewModel.setProperty("/countHnSCards", iTotalItems);
				this.setHnSIconColor();
			}
		},

		setHnSIconColor: function () {
			var aItems = this.byId("taskHnSList").getItems(),
				sIconColor = "Default";

			for (var i = 0; i < aItems.length; i++) {
				if (aItems[i].getBindingContext().getProperty("severity/number") === 1) {
					sIconColor = "Negative";
					break;
				} else {
					sIconColor = "Critical";
				}
			}
			this.byId("taskIconTabFilterHnS").setIconColor(sIconColor);
		},

		///////////////////////////////////////// CLASHES ////////////////////////////////////////////////

		crewClash: function (sCrewsForTaskID, sCrewID, oStart, oEnd) {
			var oModel = this.getModel(),
				aCrewsForTasks,
				aFilters,
				aClashingTasks = [];

			aFilters = [
				new Filter("project_ID", sap.ui.model.FilterOperator.EQ, this.getModel("appView").getProperty("/selectedProjectID")),
				new Filter("ID", sap.ui.model.FilterOperator.NE, sCrewsForTaskID), // exclude the current list item
				new Filter("crew_ID", sap.ui.model.FilterOperator.EQ, sCrewID),
				new Filter("task/estimatedEnd", sap.ui.model.FilterOperator.GT, oStart) // this is only one of the two clash filters
			];
			return new Promise(function (resolve, reject) {
				oModel.read("/CrewsForTask", {
					filters: aFilters,
					and: true,
					urlParameters: {
						$expand: "task, task/location, task/UoM, task/discipline, task/shift"
					},
					success: function (oData) {
						aCrewsForTasks = oData.results || [];
						for (var i = 0; i < aCrewsForTasks.length; i++) {
							if ((aCrewsForTasks[i].task.actualStart && aCrewsForTasks[i].task.actualStart < oEnd) ||
								aCrewsForTasks[i].task.plannedStart < oEnd) { // second clash filter
								aClashingTasks.push(aCrewsForTasks[i].task);
							}
						}
						resolve(aClashingTasks);
					}
				});
			});
		},

		workerClash: function (sWorkersForTaskID, sWorkerID, oStart, oEnd) {
			var oModel = this.getModel(),
				aWorkersForTasks,
				aFilters,
				aClashingTasks = [];

			aFilters = [
				new Filter("project_ID", sap.ui.model.FilterOperator.EQ, this.getModel("appView").getProperty("/selectedProjectID")),
				new Filter("ID", sap.ui.model.FilterOperator.NE, sWorkersForTaskID), // exclude the current list item
				new Filter("worker_ID", sap.ui.model.FilterOperator.EQ, sWorkerID),
				new Filter("task/estimatedEnd", sap.ui.model.FilterOperator.GT, oStart) // this is only one of the two clash filters
			];
			return new Promise(function (resolve, reject) {
				oModel.read("/WorkersForTask", {
					filters: aFilters,
					and: true,
					urlParameters: {
						$expand: "task, task/location, task/UoM, task/discipline, task/shift"
					},
					success: function (oData) {
						aWorkersForTasks = oData.results || [];
						for (var i = 0; i < aWorkersForTasks.length; i++) {
							if ((aWorkersForTasks[i].task.actualStart && aWorkersForTasks[i].task.actualStart < oEnd) ||
								aWorkersForTasks[i].task.plannedStart < oEnd) { // second clash filter
								aClashingTasks.push(aWorkersForTasks[i].task);
							}
						}
						resolve(aClashingTasks);
					}
				});
			});
		},

		/////////////////////////////////////////////////////////////////////////////////////////

		getRemainingQuantityAtStopTime: function (oTask) {
			// remaining quantity is calculated from the working hours between stop and estimated end 
			var oShift = this.getShiftFromID(oTask.shift_ID),
				mWorkingHoursUntilEnd = this.getNetDurationHoursFromDates(oTask.stoppedAt, oTask.estimatedEnd, oShift);

			return mWorkingHoursUntilEnd * oTask.currentProductivity;
		},

		onRefresh: function () {
			this.getView().getElementBinding().refresh(true);
		},

		onCloseTaskPress: function () {
			this.getModel("appView").setProperty("/actionButtonsInfo/midColumn/fullScreen", false);
			this.getModel("appView").setProperty("/mode", "None");
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
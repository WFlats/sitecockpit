sap.ui.define([
	"./BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator",
	"sap/ui/model/Sorter",
	"sap/ui/Device",
	"sap/m/MessageToast",
	"sap/m/MessageBox",
	"sap/m/library",
	"sap/base/Log",
	"sap/viz/ui5/data/FlattenedDataset",
	"sap/viz/ui5/controls/common/feeds/FeedItem",
	"sap/viz/ui5/format/ChartFormatter"
], function (BaseController, JSONModel, Filter, FilterOperator, Sorter, Device, MessageToast, MessageBox, mobileLibrary, Log,
	FlattenedDataset,
	FeedItem, ChartFormatter) {
	"use strict";

	return BaseController.extend("cockpit.Cockpit.controller.Analytics", {

		/**
		 * Called when a controller is instantiated and its View controls (if available) are already created.
		 * Can be used to modify the View before it is displayed, to bind event handlers and do other one-time initialization.
		 * @memberOf cockpit.Cockpit.view.Recipes
		 */
		onInit: function () {
			var oViewModel = this._createViewModel();

			this.setModel(oViewModel, "analyticsModel");
			this.getRouter().getRoute("Analytics").attachPatternMatched(this._onObjectMatched, this);

			this.setPeriodChart(0, 0, 0, "1");
		},

		_onObjectMatched: function (oEvent) {
			var oModel = this.getModel(),
				sProjectID = this.getModel("appView").getProperty("/selectedProjectID"),
				sLocationID = oEvent.getParameter("arguments").locationID,
				sLocationPath = "/" + oModel.createKey("Locations", {
					ID: sLocationID
				}),
				oLocationBC = oModel.createBindingContext(sLocationPath),
				sTitle = this.getResourceBundle().getText("analyticsTitle"),
				oWorkTimeModel = this.getModel("workTimeModel"),
				that = this;

			// fill the work times model only once
			if (!oWorkTimeModel || oWorkTimeModel.getProperty("/shifts").length === 0) {
				this.getModel("analyticsModel").setProperty("/busy", true);
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
					that.getModel("analyticsModel").setProperty("/busy", false);
				});
			} else {
				this.getModel("analyticsModel").setProperty("/busy", false);
			}
			this.getModel("analyticsModel").setProperty("/locationID", sLocationID);
			sTitle += " " + oLocationBC.getProperty("code") + " - " + oLocationBC.getProperty("description");
			this.getModel("analyticsModel").setProperty("/analyticsTitle", sTitle);

			if (this.getModel("analyticsModel").getProperty("/cumulative")) {
				this._setViewForForecast(sLocationID);
			} else {
				this._setViewForPeriod(sLocationID);
			}
		},

		_setViewForPeriod: function (sLocationID) {
			var oModel = this.getModel(),
				sPlanVersionPath = "/" + oModel.createKey("PlanVersions", {
					ID: this.getModel("appView").getProperty("/planVersionID")
				}),
				oPlanVersionBC = oModel.createBindingContext(sPlanVersionPath),
				sResourceClass = this.byId("resourceSelect").getSelectedKey(),
				oMaxDate,
				oActualDate,
				sTooltip,
				sOldTooltip;

			// set the info to select a plan version first if not selected
			if (!this.getModel("appView").getProperty("/planVersionID")) {
				this.getModel("analyticsModel").setProperty("/chartTitle", this.getResourceBundle().getText("planVersionNotSelected"));
				this.byId("planLabel").setVisible(false);
				this.byId("planDatePicker").setVisible(false);
				this.byId("actualLabel").setVisible(false);
				this.byId("actualDatePicker").setVisible(false);
				this.byId("resourceSelect").setVisible(false);
				return;
			}

			this.getModel("analyticsModel").setProperty("/chartTitle", "");
			this.byId("planLabel").setVisible(true);
			this.byId("planDatePicker").setVisible(true);
			this.byId("actualLabel").setVisible(true);
			this.byId("actualDatePicker").setVisible(true);
			this.byId("actualDatePicker").setEnabled(true);
			this.byId("resourceSelect").setVisible(true);
			this.byId("planDatePicker").setDateValue(oPlanVersionBC.getProperty("snapshotDate"));
			// actual date must be later than plan Date and not in the future
			this.byId("actualDatePicker").setMinDate(oPlanVersionBC.getProperty("snapshotDate"));
			// set the max date to the range of the plan version
			oMaxDate = new Date(oPlanVersionBC.getProperty("snapshotDate").getTime());
			switch (oPlanVersionBC.getProperty("useCase")) {
			case 0: // daily
				oMaxDate.setDate(oMaxDate.getDate() + 1);
				break;
			case 1: // weekly
				oMaxDate.setDate(oMaxDate.getDate() + 7);
				break;
			case 2: // monthly
				oMaxDate.setMonth(oMaxDate.getMonth() + 1);
				break;
			default: // long term
				oMaxDate = new Date(9999, 0, 0);
				break;
			}
			oMaxDate = (oMaxDate.getTime() > new Date().getTime()) ? new Date() : oMaxDate;
			this.byId("actualDatePicker").setMaxDate(oMaxDate);
			oActualDate = this.byId("actualDatePicker").getDateValue();
			if (!oActualDate || oActualDate.getTime() > oMaxDate.getTime()) {
				this.byId("actualDatePicker").setDateValue(oMaxDate);
			}

			// develop tooltip for planned date
			sTooltip = oPlanVersionBC.getProperty("versionNumber") + " ";
			switch (oPlanVersionBC.getProperty("useCase")) {
			case 0:
				sTooltip += this.getResourceBundle().getText("dailyPV");
				break;
			case 1:
				sTooltip += this.getResourceBundle().getText("weeklyPV");
				break;
			case 2:
				sTooltip += this.getResourceBundle().getText("monthlyPV");
				break;
			case 3:
				sTooltip += this.getResourceBundle().getText("longtermPV");
				break;
			default:
				sTooltip = "Error: Unknown type of plan version";
			}
			sOldTooltip = this.byId("planDatePicker").getTooltip();
			if (!sOldTooltip || sOldTooltip !== sTooltip) {
				// detect from the tooltip if the plan version was changed
				// navigation from master should not change the actual date, plan verson change should
				this.byId("actualDatePicker").setDateValue(oMaxDate);
			}
			this.byId("planDatePicker").setTooltip(sTooltip);

			this._displayPeriodChart(sLocationID, oPlanVersionBC.getProperty("ID"), sResourceClass,
				oPlanVersionBC.getProperty("snapshotDate"), this.byId("actualDatePicker").getDateValue());
		},

		_setViewForForecast: function (sLocationID) {
			var sResourceClass = this.byId("resourceSelect").getSelectedKey();

			//this.getModel("appView").setProperty("/planVersionID", "");

			this.getModel("analyticsModel").setProperty("/chartTitle", "");
			this.byId("planLabel").setVisible(true);
			this.byId("planDatePicker").setVisible(true);
			this.byId("actualLabel").setVisible(true);
			this.byId("actualDatePicker").setMinDate(new Date("1970-01-01"));
			this.byId("actualDatePicker").setMaxDate(new Date("9999-12-31"));
			this.byId("actualDatePicker").setVisible(true);
			this.byId("actualDatePicker").setEnabled(false);
			this.byId("resourceSelect").setVisible(true);
			this.byId("planDatePicker").setTooltip("");

			this._displayCumulatedChart(sLocationID, sResourceClass);
		},

		_displayPeriodChart: function (sLocationID, sPlanVersionID, sResourceClass, oStart, oEnd) {
			var that = this;

			this.getModel("analyticsModel").setProperty("/busy", true);
			this.getPlannedValues(sLocationID, sPlanVersionID, sResourceClass, oStart, oEnd)
				.then(function (mPlannedValue) {
					return that.getActualValues(sLocationID, sResourceClass, oStart, oEnd)
						.then(function (oActualValues) {
							that.setPeriodChart(mPlannedValue, oActualValues.earned, oActualValues.actual, sResourceClass);
							that.getModel("analyticsModel").setProperty("/busy", false);
						});
				});
		},

		_displayCumulatedChart: function (sLocationID, sResourceClass) {
			var that = this;

			this.getModel("analyticsModel").setProperty("/busy", true);
			this._getEarliestStart(sLocationID).then(function (oStart) {
				that.byId("planDatePicker").setDateValue(oStart);
				return that._getLatestEnd(sLocationID).then(function (oEnd) {
					that.byId("actualDatePicker").setDateValue(oEnd);
					if (oStart && oEnd) {
						return that._createPeriodValues(sLocationID, sResourceClass, oStart, oEnd)
							.then(function (oChartValues) {
								that.setCumulativeChart(oChartValues);
								that.getModel("analyticsModel").setProperty("/busy", false);
							});
					} else {
						that.getModel("analyticsModel").setProperty("/busy", false);
					}
				});
			});
		},

		_getEarliestStart: function (sLocationID) {
			var oModel = this.getModel(),
				myArrayMin = function (arr) {
					var len = arr.length;
					var min = Infinity;
					while (len--) {
						if (arr[len].actualStart && arr[len].actualStart.getTime() < min) {
							min = arr[len].actualStart.getTime();
						}
					}
					return new Date(min);
				};

			return new Promise(function (resolve, reject) {
				oModel.read("/Tasks", {
					filters: [new Filter("location_ID", FilterOperator.EQ, sLocationID)],
					sorter: new Sorter("actualStart", false),
					urlParameters: {
						$top: 100 // revisit
					},
					success: function (oData) {
						if (oData && oData.results.length > 0) {
							resolve(myArrayMin(oData.results)); // revisit
							//resolve(oData.results[0].actualStart);
						} else {
							resolve(undefined);
						}
					},
					error: function (oError) {
						Log.error("Error finding the first task start of the location");
						resolve(undefined);
					}
				});
			});
		},

		_getLatestEnd: function (sLocationID) {
			var oModel = this.getModel(),
				myArrayMax = function (arr) {
					var len = arr.length;
					var max = -Infinity;
					while (len--) {
						if (arr[len].estimatedEnd.getTime() > max) {
							max = arr[len].estimatedEnd.getTime();
						}
					}
					return new Date(max);
				};

			return new Promise(function (resolve, reject) {
				oModel.read("/Tasks", {
					filters: [new Filter("location_ID", FilterOperator.EQ, sLocationID)],
					sorter: new Sorter("estimatedEnd", true),
					urlParameters: {
						$top: 100 // revisit
					},
					success: function (oData) {
						if (oData && oData.results.length > 0) {
							resolve(myArrayMax(oData.results)); // revisit: sorting not working
							//resolve(oData.results[0].estimatedEnd);
						} else {
							resolve(undefined);
						}
					},
					error: function (oError) {
						Log.error("Error finding the last task end of the location");
						resolve(undefined);
					}
				});
			});
		},

		onResourceOrDateChange: function () {
			var sResourceClass = this.byId("resourceSelect").getSelectedKey(),
				sLocationID = this.getModel("analyticsModel").getProperty("/locationID"),
				sPlanVersionID = this.getModel("appView").getProperty("/planVersionID"),
				oStart = this.byId("planDatePicker").getDateValue(),
				oEnd = this.byId("actualDatePicker").getDateValue();

			if (this.getModel("analyticsModel").getProperty("/cumulative")) {
				this._displayCumulatedChart(sLocationID, sResourceClass);
			} else {
				this._displayPeriodChart(sLocationID, sPlanVersionID, sResourceClass, oStart, oEnd);
			}
		},

		onChartSwitch: function (oEvent) {
			var sLocationID = this.getModel("analyticsModel").getProperty("/locationID");

			if (oEvent.getParameter("pressed")) {
				oEvent.getSource().setIcon("sap-icon://line-chart-dual-axis");
				oEvent.getSource().setTooltip(this.getResourceBundle().getText("chartSwitchToEVM"));
				this._setViewForForecast(sLocationID);
			} else {
				oEvent.getSource().setIcon("sap-icon://column-chart-dual-axis");
				oEvent.getSource().setTooltip(this.getResourceBundle().getText("chartSwitch"));
				this._setViewForPeriod(sLocationID);
			}
		},

		getPlannedValues: function (sLocationID, sPlanVersionID, sResourceClass, oStart, oEnd) {
			var oModel = this.getModel(),
				aFilters = [
					new Filter("location_ID", FilterOperator.EQ, sLocationID),
					new Filter("planVersion_ID", FilterOperator.EQ, sPlanVersionID),
					new Filter("plannedStart", FilterOperator.LT, oEnd),
					new Filter("estimatedEnd", FilterOperator.GT, oStart)
				],
				that = this;

			return new Promise(function (resolve, reject) {
				oModel.read("/SnapshotTasks", {
					filters: aFilters,
					and: true,
					success: function (oData) {
						var mPlanned = 0;
						if (oData && oData.results.length > 0) {
							oData.results.forEach(function (oTask) {
								var mPeriodFactor = that._getFactorOfPlannedWorkWithinPeriod(oTask, oStart, oEnd);
								switch (sResourceClass) {
								case "0": // total cost
									mPlanned += Number(oTask.costPlanned) * mPeriodFactor;
									break;
								case "1": // labor cost
									mPlanned += Number(oTask.costLaborPlanned) * mPeriodFactor;
									break;
								case "2": // labor hours
									mPlanned += Number(oTask.hoursLaborPlanned) * mPeriodFactor;
									break;
								case "3": // material cost
									mPlanned += Number(oTask.costMaterialPlanned) * mPeriodFactor;
									break;
								case "4": // Equipment cost
									mPlanned += Number(oTask.costEquipmentPlanned) * mPeriodFactor;
									break;
								case "5": // Equipment hours
									mPlanned += Number(oTask.hoursEquipmentPlanned) * mPeriodFactor;
									break;
								case "6": // subcontract cost
									mPlanned += Number(oTask.costSubcontractorPlanned) * mPeriodFactor; // ! different property name as in Tasks
									break;
								default:
									mPlanned += 0;
								}
							});
							resolve(mPlanned);
						} else {
							resolve(0);
						}
					},
					error: function (oError) {
						Log.error("Error reading snapshots");
						reject();
					}
				});
			});
		},

		getActualValues: function (sLocationID, sResourceClass, oStart, oEnd) {
			var oModel = this.getModel(),
				aFilters = [
					new Filter("location_ID", FilterOperator.EQ, sLocationID),
					new Filter("status", FilterOperator.GE, 2),
					new Filter("actualStart", FilterOperator.LT, oEnd),
					new Filter("estimatedEnd", FilterOperator.GT, oStart)
				],
				that = this;

			return new Promise(function (resolve, reject) {
				oModel.read("/Tasks", {
					filters: aFilters,
					and: true,
					success: function (oData) {
						var oActuals = {
							earned: 0,
							actual: 0
						};
						if (oData && oData.results.length > 0) {
							oData.results.forEach(function (oTask) {
								// actualQuantity = undefined if no measurement made
								var mEarnedValueFactor = that._getFactorOfActualWorkWithinPeriod(oTask, oStart, oEnd);
								switch (sResourceClass) {
								case "0": // total cost
									oActuals.earned += Number(oTask.costPlanned) * mEarnedValueFactor;
									oActuals.actual += Number(oTask.costActual) * mEarnedValueFactor;
									break;
								case "1": // labor cost
									oActuals.earned += Number(oTask.costLaborPlanned) * mEarnedValueFactor;
									oActuals.actual += Number(oTask.costLaborActual) * mEarnedValueFactor;
									break;
								case "2": // labor hours
									oActuals.earned += Number(oTask.hoursLaborPlanned) * mEarnedValueFactor;
									oActuals.actual += Number(oTask.hoursLaborActual) * mEarnedValueFactor;
									break;
								case "3": // material cost
									oActuals.earned += Number(oTask.costMaterialPlanned) * mEarnedValueFactor;
									oActuals.actual += Number(oTask.costMaterialActual) * mEarnedValueFactor;
									break;
								case "4": // Equipment cost
									oActuals.earned += Number(oTask.costEquipmentPlanned) * mEarnedValueFactor;
									oActuals.actual += Number(oTask.costEquipmentActual) * mEarnedValueFactor;
									break;
								case "5": // Equipment hours
									oActuals.earned += Number(oTask.hoursEquipmentPlanned) * mEarnedValueFactor;
									oActuals.actual += Number(oTask.hoursEquipmentActual) * mEarnedValueFactor;
									break;
								case "6": // subcontract cost
									oActuals.earned += Number(oTask.plannedTotalPrice) * mEarnedValueFactor;
									oActuals.actual += Number(oTask.actualTotalPrice) * mEarnedValueFactor;
									break;
								default:
									oActuals.earned += 0;
									oActuals.actual += 0;
								}
							});
							resolve(oActuals);
						} else {
							resolve(oActuals);
						}
					},
					error: function (oError) {
						Log.error("Error reading Tasks");
						reject();
					}
				});
			});
		},

		getPlannedAndActualValues: function (sLocationID, sResourceClass, oStart, oEnd) {
			// reads tasks only, no snapshots
			var oModel = this.getModel(),
				// revisit: finds tasks either when actual data is within period or if planned data is within period
				// but if a task was started in the next period but planned for the current it will not be found 
				// because the status is >= 2
				// solution: read with a planned filter excluding status filter (done), then skip potential duplicates
				aActualFilters = new Filter({
					filters: [
						new Filter("location_ID", FilterOperator.EQ, sLocationID),
						new Filter("status", FilterOperator.GE, 2),
						new Filter("actualStart", FilterOperator.LT, oEnd),
						new Filter("estimatedEnd", FilterOperator.GT, oStart)
					],
					and: true
				}),
				aPlannedFilters = new Filter({
					filters: [
						new Filter("location_ID", FilterOperator.EQ, sLocationID),
						//new Filter("status", FilterOperator.LT, 2), revisit
						new Filter("plannedStart", FilterOperator.LT, oEnd),
						new Filter("plannedEnd", FilterOperator.GT, oStart)
					],
					and: true
				}),
				aCombinedFilter = [new Filter({
					filters: [aActualFilters, aPlannedFilters],
					and: false
				})],
				that = this;

			return new Promise(function (resolve, reject) {
				oModel.read("/Tasks", {
					filters: aCombinedFilter,
					success: function (oData) {
						var oValues = {
							planned: 0,
							earned: 0,
							actual: 0
						};
						if (oData && oData.results.length > 0) {
							oData.results.forEach(function (oTask) { // revisit: better reduce
								// actualQuantity = undefined if no measurement made
								var mEarnedValueFactor = that._getFactorOfActualWorkWithinPeriod(oTask, oStart, oEnd);
								var mPlannedValueFactor = that._getFactorOfPlannedWorkWithinPeriodFromTask(oTask, oStart, oEnd);
								switch (sResourceClass) {
								case "0": // total cost
									oValues.planned += Number(oTask.costPlanned) * mPlannedValueFactor;
									oValues.earned += Number(oTask.costPlanned) * mEarnedValueFactor;
									oValues.actual += Number(oTask.costActual) * mEarnedValueFactor;
									break;
								case "1": // labor cost
									oValues.planned += Number(oTask.costLaborPlanned) * mPlannedValueFactor;
									oValues.earned += Number(oTask.costLaborPlanned) * mEarnedValueFactor;
									oValues.actual += Number(oTask.costLaborActual) * mEarnedValueFactor;
									break;
								case "2": // labor hours
									oValues.planned += Number(oTask.hoursLaborPlanned) * mPlannedValueFactor;
									oValues.earned += Number(oTask.hoursLaborPlanned) * mEarnedValueFactor;
									oValues.actual += Number(oTask.hoursLaborActual) * mEarnedValueFactor;
									break;
								case "3": // material cost
									oValues.planned += Number(oTask.costMaterialPlanned) * mPlannedValueFactor;
									oValues.earned += Number(oTask.costMaterialPlanned) * mEarnedValueFactor;
									oValues.actual += Number(oTask.costMaterialActual) * mEarnedValueFactor;
									break;
								case "4": // Equipment cost
									oValues.planned += Number(oTask.costEquipmentPlanned) * mPlannedValueFactor;
									oValues.earned += Number(oTask.costEquipmentPlanned) * mEarnedValueFactor;
									oValues.actual += Number(oTask.costEquipmentActual) * mEarnedValueFactor;
									break;
								case "5": // Equipment hours
									oValues.planned += Number(oTask.hoursEquipmentPlanned) * mPlannedValueFactor;
									oValues.earned += Number(oTask.hoursEquipmentPlanned) * mEarnedValueFactor;
									oValues.actual += Number(oTask.hoursEquipmentActual) * mEarnedValueFactor;
									break;
								case "6": // subcontract cost
									oValues.planned += Number(oTask.plannedTotalPrice) * mPlannedValueFactor;
									oValues.earned += Number(oTask.plannedTotalPrice) * mEarnedValueFactor;
									oValues.actual += Number(oTask.actualTotalPrice) * mEarnedValueFactor;
									break;
								default:
									oValues.planned += 0;
									oValues.earned += 0;
									oValues.actual += 0;
								}
							});
							resolve(oValues);
						} else {
							resolve(oValues);
						}
					},
					error: function (oError) {
						Log.error("Error reading Tasks");
						reject();
					}
				});
			});
		},

		_getFactorOfPlannedWorkWithinPeriodFromTask: function (oTask, oPeriodStart, oPeriodEnd) {
			var oShift = this.getShiftFromID(oTask.shift_ID),
				mHoursPlannedInPeriod,
				mFactor;
			if (oTask.plannedStart.getTime() >= oPeriodEnd.getTime()) { // end time can be adjusted by the user
				return 0; // should not pass overlap filter
			}
			if (oTask.plannedEnd.getTime() <= oPeriodStart.getTime()) { // start and end planned before period
				return 0;
			}
			if (oTask.plannedEnd.getTime() <= oPeriodEnd.getTime()) { // task ends within period
				if (oTask.plannedStart.getTime() >= oPeriodStart.getTime()) { // start within period, full value
					return 1;
				} else { // start planned before period
					mHoursPlannedInPeriod = this.getNetDurationHoursFromDates(oPeriodStart, oTask.plannedEnd, oShift);
					mFactor = mHoursPlannedInPeriod / (oTask.quantity / oTask.plannedProductivity);
					return mFactor;
				}
			}
			// task ends after period end; value from start to period end
			mHoursPlannedInPeriod = this.getNetDurationHoursFromDates(oTask.plannedStart, oPeriodEnd, oShift);
			mFactor = mHoursPlannedInPeriod / (oTask.quantity / oTask.plannedProductivity);
			return mFactor;
		},

		_getFactorOfPlannedWorkWithinPeriod: function (oSnapshotTask, oPeriodStart, oPeriodEnd) {
			var oShift = this.getShiftFromID(oSnapshotTask.shift_ID),
				mHoursPlannedInPeriod,
				mFactor;
			if (oSnapshotTask.plannedStart.getTime() >= oPeriodEnd.getTime()) { // end time can be adjusted by the user
				return 0; // should not pass overlap filter
			}
			if (oSnapshotTask.plannedEnd.getTime() <= oPeriodStart.getTime()) { // start and end before period
				return 0;
			}
			if (oSnapshotTask.plannedEnd.getTime() <= oPeriodEnd.getTime()) { // task ends within period
				if (oSnapshotTask.plannedStart.getTime() >= oPeriodStart.getTime()) { // start within period, full value
					return 1;
				} else { // start before period
					mHoursPlannedInPeriod = this.getNetDurationHoursFromDates(oPeriodStart, oSnapshotTask.plannedEnd, oShift);
					mFactor = mHoursPlannedInPeriod / (oSnapshotTask.plannedQuantity / oSnapshotTask.plannedProductivity);
					return mFactor;
				}
			}
			// task ends after period end; value from start to period end
			mHoursPlannedInPeriod = this.getNetDurationHoursFromDates(oSnapshotTask.plannedStart, oPeriodEnd, oShift);
			mFactor = mHoursPlannedInPeriod / (oSnapshotTask.plannedQuantity / oSnapshotTask.plannedProductivity);
			return mFactor;
		},

		_getFactorOfActualWorkWithinPeriod: function (oTask, oPeriodStart, oPeriodEnd) {
			// as period end can be adjusted oTask can be started before, within or after the period
			if (!oTask.actualQuantity || oTask.actualStart.getTime() > oPeriodEnd.getTime()) {
				return 0;
			}
			var oShift = this.getShiftFromID(oTask.shift_ID),
				oDateActualQuantityAchieved = this.getEndDateInWorkingHours(oTask.actualStart, oTask.actualQuantity,
					oTask.currentProductivity, oShift),
				mHoursWorkedInPeriod,
				mFactor;

			if (oTask.actualStart.getTime() < oPeriodStart.getTime()) { // task started before period
				if (oDateActualQuantityAchieved.getTime() < oPeriodStart.getTime()) { // worked only before period
					return 0;
				} else if (oDateActualQuantityAchieved.getTime() > oPeriodEnd.getTime()) { // worked until after period
					// worked the whole shift in the period
					mHoursWorkedInPeriod = this.getNetDurationHoursFromDates(oPeriodStart, oPeriodEnd, oShift);
				} else { // work started before but ended within period
					mHoursWorkedInPeriod = this.getNetDurationHoursFromDates(oPeriodStart, oDateActualQuantityAchieved, oShift);
				}
			} else { // started within period
				if (oDateActualQuantityAchieved.getTime() > oPeriodEnd.getTime()) { // worked until after period
					mHoursWorkedInPeriod = this.getNetDurationHoursFromDates(oTask.actualStart, oPeriodEnd, oShift);
				} else { // started and ended within period
					mHoursWorkedInPeriod = this.getNetDurationHoursFromDates(oTask.actualStart, oDateActualQuantityAchieved, oShift);
				}
			}
			mFactor = mHoursWorkedInPeriod / (oTask.quantity / oTask.currentProductivity); // quantity / productivity = duration
			return mFactor;
		},

		_createPeriodValues: function (sLocationID, sResourceClass, oStart, oEnd) {
			var aPeriodEndDates = [],
				oPeriodEnd = new Date(oStart.getFullYear(), oStart.getMonth() + 1, 1, 0, 0, 0, 0),
				oChartValues = {
					Values: []
				},
				that = this;

			return new Promise(function (res) {
				aPeriodEndDates.push(new Date(oPeriodEnd.getTime()));
				while (oPeriodEnd.getTime() <= oEnd.getTime()) {
					oPeriodEnd.setMonth(oPeriodEnd.getMonth() + 1);
					aPeriodEndDates.push(new Date(oPeriodEnd.getTime()));
				}
				// workaround: can't use the accumulator to collect the period values as the initial value is a promise
				// so I made x a promise by itself and collect period values into oChartValues
				// so I can cal x and after reducing is complete I can return oChartValues
				var fReducer = aPeriodEndDates.reduce(function (oProm, oEndDate, i) {
					return oProm.then(function () {
						var oStartDate = new Date(oEndDate.getTime());
						oStartDate.setMonth(oStartDate.getMonth() - 1);
						return that.getPlannedAndActualValues(sLocationID, sResourceClass, oStartDate, oEndDate)
							.then(function (oPeriodValues) {
								var oChartPeriodValue = {
									Date: [
										oEndDate.getFullYear(),
										("0" + (oEndDate.getMonth() + 1)).slice(-2),
										("0" + oEndDate.getDate()).slice(-2)
									].join("-"),
									PV: parseFloat(oPeriodValues.planned).toFixed(0),
									PVcum: parseFloat(oPeriodValues.planned).toFixed(0),
									EV: parseFloat(oPeriodValues.earned).toFixed(0),
									EVcum: parseFloat(oPeriodValues.earned).toFixed(0),
									AC: parseFloat(oPeriodValues.actual).toFixed(0),
									ACcum: parseFloat(oPeriodValues.actual).toFixed(0),
									EAC: "0"
								};
								if (oChartValues.Values.length > 0) {
									// cumulate the values by adding the accumulated values of the last period
									oChartPeriodValue.PVcum = parseFloat(Number(oChartPeriodValue.PV) +
										Number(oChartValues.Values[oChartValues.Values.length - 1].PVcum)).toFixed(0);
									oChartPeriodValue.EVcum = parseFloat(Number(oChartPeriodValue.EV) +
										Number(oChartValues.Values[oChartValues.Values.length - 1].EVcum)).toFixed(0);
									oChartPeriodValue.ACcum = parseFloat(Number(oChartPeriodValue.AC) +
										Number(oChartValues.Values[oChartValues.Values.length - 1].ACcum)).toFixed(0);
								}
								oChartValues.Values.push(oChartPeriodValue);
							}).then(function () {
								return Promise.resolve();
							});
					});
				}, Promise.resolve());

				fReducer.then(function () {
					oChartValues = that._setEAC(oChartValues);
					res(oChartValues);
				});
			});
		},

		_setEAC: function (oChartValues) {
			var oNow = new Date(),
				getActualsUntil = function (index) {
					var mActuals = 0;
					for (var i = 0; i <= index; i++) {
						mActuals += Number(oChartValues.Values[i].AC);
					}
					return mActuals;
				},
				getPlannedFrom = function (index) {
					var mPlanned = 0;
					for (var i = index; i < oChartValues.Values.length; i++) {
						mPlanned += Number(oChartValues.Values[i].PV);
					}
					return mPlanned;
				},
				oReturnValues = {
					Values: []
				};

			oChartValues.Values.forEach(function (oPeriodValues, i) {
				oReturnValues.Values.push(oPeriodValues);
				if (oPeriodValues.AC === "0" && oPeriodValues.EV === "0") { // if no actuals the EAC stays the same
					if (i > 0) {
						oReturnValues.Values[i].EAC = oReturnValues.Values[i - 1].EAC;
					}
				} else {
					if (i === oChartValues.Values.length - 1) { // no planned values in the last period
						oReturnValues.Values[i].EAC = parseFloat(getActualsUntil(i)).toFixed(0);
					} else {
						oReturnValues.Values[i].EAC = parseFloat(getActualsUntil(i) + getPlannedFrom(i + 1)).toFixed(0);
					}
				}
			});
			return oReturnValues;
		},

		_createViewModel: function () {
			return new JSONModel({
				isFilterBarVisible: false,
				filterBarLabel: "",
				busy: false,
				delay: 0,
				analyticsTitle: "",
				chartTitle: "",
				locationID: "",
				selectedPlanVersionID: "",
				cumulative: false
			});
		},

		onNavToSnapshots: function () {
			var bReplace = !Device.system.phone;

			// set the layout property of FCL control to show two columns
			this.getModel("appView").setProperty("/layout", "ThreeColumnsEndExpanded");
			this.getRouter().navTo("Snapshots", {
				projectID: this.getModel("appView").getProperty("/selectedProjectID")
			}, bReplace);
		},

		onCloseDetailPress: function () {
			this.getModel("appView").setProperty("/layout", "OneColumn");
			this.getModel("appView").setProperty("/actionButtonsInfo/midColumn/fullScreen", false);
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
		},

		setPeriodChart: function (pv, ev, ac, rc) {
			var iDecimals = (rc === "2" || rc === "5") ? 2 : 0,
				sLabel = (rc === "2" || rc === "5") ?
				this.getResourceBundle().getText("chartLabelHours") : this.getResourceBundle().getText("chartLabelCost"),
				cpi = (ac && !isNaN(ac) && Number(ac) !== 0) ? parseFloat(ev / ac).toFixed(2) : "0.00",
				spi = (pv && !isNaN(pv) && Number(pv) !== 0) ? parseFloat(ev / pv).toFixed(2) : "0.00",
				sTitle = "CPI " + cpi + " - SPI " + spi,
				oJSONModel = new JSONModel({
					"Values": [{
						Value: sLabel,
						PV: parseFloat(pv).toFixed(iDecimals),
						EV: parseFloat(ev).toFixed(iDecimals),
						AC: parseFloat(ac).toFixed(iDecimals),
						CV: parseFloat(ev - ac).toFixed(iDecimals),
						SV: parseFloat(ev - pv).toFixed(iDecimals)
					}]
				}),
				oVizFrame = this.byId("chartContainerVizFrame");

			oVizFrame.destroyDataset();
			oVizFrame.destroyFeeds();
			oVizFrame.setVizType("column");

			oVizFrame.setModel(oJSONModel);
			if (pv === 0 && ev === 0 && ac === 0) {
				return; // called by onInit, i.e. oModel not available yet
				// but oVizFrame model must be set or it throws errors
			}
			var oData = {
				"dimensions": [{
					"name": "Values",
					"value": "{Value}"
				}],
				"measures": [{
					"name": "PV",
					"value": "{PV}"
				}, {
					"name": "EV",
					"value": "{EV}"
				}, {
					"name": "AC",
					"value": "{AC}"
				}, {
					"name": "CV",
					"value": "{CV}"
				}, {
					"name": "SV",
					"value": "{SV}"
				}],
				data: {
					path: "/Values"
				}
			};
			var oDataset = new FlattenedDataset(oData);
			oVizFrame.setDataset(oDataset);
			oVizFrame.setVizProperties({
				title: {
					text: sTitle
				},
				dataLabel: {
					visible: true,
					showTotal: true
				}
			});
			var oFeedValueAxis = new FeedItem({
				"uid": "valueAxis",
				"type": "Measure",
				"values": ["PV", "EV", "AC", "CV", "SV"]
			});
			var oFeedcategoryAxis = new FeedItem({
				"uid": "categoryAxis",
				"type": "Dimension",
				"values": ["Values"]
			});
			oVizFrame.addFeed(oFeedValueAxis);
			oVizFrame.addFeed(oFeedcategoryAxis);

			var aMeasures = oVizFrame.getDataset().getAggregation("measures"),
				sUnit;
			if (rc === "2" || rc === "5") { // labor or equipment hours
				sUnit = this.getResourceBundle().getText("hours");
			} else {
				var oModel = this.getModel(),
					sProjectPath = "/" + oModel.createKey("Projects", {
						ID: this.getModel("appView").getProperty("/selectedProjectID")
					});
				sUnit = oModel.createBindingContext(sProjectPath).getProperty("currency_code");
			}
			for (var i = 0; i < aMeasures.length; i++) {
				aMeasures[i].setUnit(sUnit);
			}
		},

		setCumulativeChart: function (oChartValues) {
			var oChartModel = new JSONModel(oChartValues),
				oModel = this.getModel(),
				sProjectPath = "/" + oModel.createKey("Projects", {
					ID: this.getModel("appView").getProperty("/selectedProjectID")
				}),
				sCurrencyCode = oModel.createBindingContext(sProjectPath).getProperty("currency_code"),
				sTitle = this.getResourceBundle().getText("forecastTitle", sCurrencyCode),
				oVizFrame = this.byId("chartContainerVizFrame");

			oVizFrame.destroyDataset();
			oVizFrame.destroyFeeds();
			oVizFrame.setVizType("timeseries_line");
			oVizFrame.setModel(oChartModel);
			var oData = {
				"dimensions": [{
					"name": "Date",
					"value": "{Date}",
					"dataType": "date"
				}],
				"measures": [{
					"name": "PVcum",
					"value": "{PVcum}"
				}, {
					"name": "EVcum",
					"value": "{EVcum}"
				}, {
					"name": "ACcum",
					"value": "{ACcum}"
				}, {
					"name": "EAC",
					"value": "{EAC}"
				}],
				data: {
					path: "/Values"
				}
			};
			var oDataset = new FlattenedDataset(oData);
			oVizFrame.setDataset(oDataset);
			oVizFrame.setVizProperties({
				title: {
					text: sTitle
				},
				dataLabel: {
					visible: true,
					showTotal: true
				},
				timeAxis: {
					levels: ["month", "year"],
					visible: true
				}
			});
			var oFeedValueAxis = new FeedItem({
				"uid": "valueAxis",
				"type": "Measure",
				"values": ["PVcum", "EVcum", "ACcum", "EAC"]
			});
			var oFeedTimeAxis = new FeedItem({
				"uid": "timeAxis",
				"type": "Dimension",
				"values": ["Date"]
			});
			oVizFrame.addFeed(oFeedValueAxis);
			oVizFrame.addFeed(oFeedTimeAxis);
		}

	});

});
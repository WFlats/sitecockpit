sap.ui.define([
	"./BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator",
	"sap/ui/Device",
	"sap/m/MessageToast",
	"sap/m/MessageBox",
	"sap/m/library",
	"sap/base/Log"
], function (BaseController, JSONModel, Filter, FilterOperator, Device, MessageToast, MessageBox, mobileLibrary, Log) {
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

			this.setDataModel(0, 0, 0, "1");
		},

		_onObjectMatched: function (oEvent) {
			var oModel = this.getModel(),
				sLocationID = oEvent.getParameter("arguments").locationID,
				sLocationPath = "/" + oModel.createKey("Locations", {
					ID: sLocationID
				}),
				oLocationBC = oModel.createBindingContext(sLocationPath),
				sTitle = this.getResourceBundle().getText("analyticsTitle"),
				sPlanVersionPath,
				oPlanVersionBC,
				sTooltip,
				sResourceClass,
				that = this;

			this.getModel("analyticsModel").setProperty("/locationID", sLocationID);
			sTitle += " " + oLocationBC.getProperty("code") + " - " + oLocationBC.getProperty("description");
			this.getModel("analyticsModel").setProperty("/analyticsTitle", sTitle);
			// set the info to select a plan version first
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
			this.byId("resourceSelect").setVisible(true);

			sPlanVersionPath = "/" + oModel.createKey("PlanVersions", {
				ID: this.getModel("appView").getProperty("/planVersionID")
			});
			oPlanVersionBC = oModel.createBindingContext(sPlanVersionPath);
			this.byId("planDatePicker").setDateValue(oPlanVersionBC.getProperty("snapshotDate"));
			// actual date must be later than plan Date and not in the future
			this.byId("actualDatePicker").setMinDate(oPlanVersionBC.getProperty("snapshotDate"));
			this.byId("actualDatePicker").setMaxDate(new Date());

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
			//this.getModel("analyticsModel").setProperty("/chartTitle", sVersionTitle);
			this.byId("planDatePicker").setTooltip(sTooltip);
			if (!this.byId("actualDatePicker").getDateValue()) {
				this.byId("actualDatePicker").setDateValue(new Date());
			}
			sResourceClass = this.byId("resourceSelect").getSelectedKey();
			this.getModel("analyticsModel").setProperty("/busy", true);
			this.getPlannedValues(sLocationID, oPlanVersionBC.getProperty("ID"), sResourceClass)
				.then(function (mPlannedValue) {
					that.getActualValues(sLocationID, sResourceClass)
						.then(function (oActualValues) {
							that.setDataModel(mPlannedValue, oActualValues.earned, oActualValues.actual, sResourceClass);
							that.getModel("analyticsModel").setProperty("/busy", false);
						});
				});
		},

		onResourceChange: function () {
			var sResourceClass = this.byId("resourceSelect").getSelectedKey(),
				sLocationID = this.getModel("analyticsModel").getProperty("/locationID"),
				sPlanVersionID = this.getModel("appView").getProperty("/planVersionID"),
				that = this;

			this.getModel("analyticsModel").setProperty("/busy", true);
			this.getPlannedValues(sLocationID, sPlanVersionID, sResourceClass)
				.then(function (mPlannedValue) {
					that.getActualValues(sLocationID, sResourceClass)
						.then(function (oActualValues) {
							that.setDataModel(mPlannedValue, oActualValues.earned, oActualValues.actual, sResourceClass);
							that.getModel("analyticsModel").setProperty("/busy", false);
						});
				});
		},

		getPlannedValues: function (sLocationID, sPlanVersionID, sResourceClass) {
			var oModel = this.getModel(),
				aFilters = [
					new Filter("location_ID", FilterOperator.EQ, sLocationID),
					new Filter("planVersion_ID", FilterOperator.EQ, sPlanVersionID)
				],
				mPlanned = 0.0,
				iDecimals = (sResourceClass === "2" || sResourceClass === "5") ? 2 : 0;

			return new Promise(function (resolve, reject) {
				oModel.read("/SnapshotTasks", {
					filters: aFilters,
					and: true,
					success: function (oData) {
						if (oData && oData.results.length > 0) {
							oData.results.forEach(function (oTask) {
								switch (sResourceClass) {
								case "0": // total cost
									mPlanned += Number(oTask.costPlanned);
									break;
								case "1": // labor cost
									mPlanned += Number(oTask.costLaborPlanned);
									break;
								case "2": // labor hours
									mPlanned += Number(oTask.hoursLaborPlanned);
									break;
								case "3": // material cost
									mPlanned += Number(oTask.costMaterialPlanned);
									break;
								case "4": // Equipment cost
									mPlanned += Number(oTask.costEquipmentPlanned);
									break;
								case "5": // Equipment hours
									mPlanned += Number(oTask.hoursEquipmentPlanned);
									break;
								case "6": // subcontract cost
									mPlanned += Number(oTask.costSubcontractorPlanned); // ! different property name as in Tasks
									break;
								default:
									mPlanned += 0;
								}
							});
							resolve(parseFloat(mPlanned).toFixed(iDecimals));
						} else {
							resolve(0);
						}
					},
					error: function (oError) {
						Log.error("Error reading snap shots");
						reject();
					}
				});
			});
		},

		getActualValues: function (sLocationID, sResourceClass) {
			var oModel = this.getModel(),
				oFilter = new Filter("location_ID", FilterOperator.EQ, sLocationID),
				oStatusFilter = new Filter("status", FilterOperator.GE, 4), // revisit: for now only completed tasks
				oActuals = {
					earned: 0.0,
					actual: 0.0
				},
				iDecimals = (sResourceClass === "2" || sResourceClass === "5") ? 2 : 0,
				mEarnedValueFactor;

			return new Promise(function (resolve, reject) {
				oModel.read("/Tasks", {
					filters: [oFilter, oStatusFilter],
					and: true,
					success: function (oData) {
						if (oData && oData.results.length > 0) {
							oData.results.forEach(function (oTask) {
								mEarnedValueFactor = (oTask.status >= 4) ? oTask.actualQuantity / oTask.quantity : 1; // revisit
								switch (sResourceClass) {
								case "0": // total cost
									oActuals.earned += Number(oTask.costPlanned) * mEarnedValueFactor;
									oActuals.actual += Number(oTask.costActual);
									break;
								case "1": // labor cost
									oActuals.earned += Number(oTask.costLaborPlanned) * mEarnedValueFactor;
									oActuals.actual += Number(oTask.costLaborActual);
									break;
								case "2": // labor hours
									oActuals.earned += Number(oTask.hoursLaborPlanned) * mEarnedValueFactor;
									oActuals.actual += Number(oTask.hoursLaborActual);
									break;
								case "3": // material cost
									oActuals.earned += Number(oTask.costMaterialPlanned) * mEarnedValueFactor;
									oActuals.actual += Number(oTask.costMaterialActual);
									break;
								case "4": // Equipment cost
									oActuals.earned += Number(oTask.costEquipmentPlanned) * mEarnedValueFactor;
									oActuals.actual += Number(oTask.costEquipmentActual);
									break;
								case "5": // Equipment hours
									oActuals.earned += Number(oTask.hoursEquipmentPlanned) * mEarnedValueFactor;
									oActuals.actual += Number(oTask.hoursEquipmentActual);
									break;
								case "6": // subcontract cost
									oActuals.earned += Number(oTask.plannedTotalPrice) * mEarnedValueFactor;
									oActuals.actual += Number(oTask.actualTotalPrice);
									break;
								default:
									oActuals.earned += 0;
									oActuals.actual += 0;
								}
							});
							oActuals.earned = parseFloat(oActuals.earned).toFixed(iDecimals);
							oActuals.actual = parseFloat(oActuals.actual).toFixed(iDecimals);
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

		_createViewModel: function () {
			return new JSONModel({
				isFilterBarVisible: false,
				filterBarLabel: "",
				busy: false,
				delay: 0,
				analyticsTitle: "",
				chartTitle: "",
				locationID: "",
				selectedPlanVersionID: ""
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

		/////////////////// TESTING ///////////////////

		setDataModel: function (pv, ev, ac, rc) {
			var oJSONModel = new JSONModel({
					"Values": [{
						"Value": "Planned Value, Earned Value, Actual Cost, Cost and Schedule Variance",
						"PV": pv,
						"EV": ev,
						"AC": ac,
						"CV": ev - ac,
						"SV": ev - pv
					}]
				}),
				cpi = ac ? parseFloat(ev / ac).toFixed(2) : 0.00,
				spi = pv ? parseFloat(ev / pv).toFixed(2) : 0.00,
				sTitle = "CPI " + cpi + " SPI " + spi;
			this.byId("chartContainerVizFrame").setModel(oJSONModel);
			//this.getModel("analyticsModel").setProperty("/analyticsTitle", sTitle);
			//this.byId("chartContent").setTitle(sTitle);
			var oVizFrame = this.byId("chartContainerVizFrame");
			oVizFrame.setVizProperties({
				title: {
					text: sTitle
				},
				dataLabel: {
					visible: true,
					showTotal: true
				}
			});
			if (pv === 0 && ev === 0 && ac === 0) {
				return; // called by onInit, i.e. oModel not available yet
			}
			if (rc === "2" || rc === "5") { // labor or equipment hours
				this.byId("mD1").setUnit("Hours");
				this.byId("mD2").setUnit("Hours");
				this.byId("mD3").setUnit("Hours");
				this.byId("mD4").setUnit("Hours");
				this.byId("mD5").setUnit("Hours");
			} else {
				var oModel = this.getModel(),
					sProjectPath = "/" + oModel.createKey("Projects", {
						ID: this.getModel("appView").getProperty("/selectedProjectID")
					}),
					sCurrencyCode = oModel.createBindingContext(sProjectPath).getProperty("currency_code");
				this.byId("mD1").setUnit(sCurrencyCode);
				this.byId("mD2").setUnit(sCurrencyCode);
				this.byId("mD3").setUnit(sCurrencyCode);
				this.byId("mD4").setUnit(sCurrencyCode);
				this.byId("mD5").setUnit(sCurrencyCode);
			}
		}

	});

});
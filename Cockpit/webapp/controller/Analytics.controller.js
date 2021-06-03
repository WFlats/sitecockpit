sap.ui.define([
	"./BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/ui/Device",
	"sap/m/MessageToast",
	"sap/m/MessageBox",
	"sap/m/library",
	"sap/base/Log"
], function (BaseController, JSONModel, Device, MessageToast, MessageBox, mobileLibrary, Log) {
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

			// revisit: for testing only
			this.setDataModel();
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
				sVersionTitle;

			sTitle += " " + oLocationBC.getProperty("code") + " - " + oLocationBC.getProperty("description");
			this.getModel("analyticsModel").setProperty("/analyticsTitle", sTitle);
			// set the info to select a plan version first
			if (!this.getModel("appView").getProperty("/planVersionID")) {
				this.getModel("analyticsModel").setProperty("/chartTitle", this.getResourceBundle().getText("planVersionNotSelected"));
				this.onNavToSnapshots();
			}
			sPlanVersionPath = "/" + oModel.createKey("PlanVersions", {
				ID: this.getModel("appView").getProperty("/planVersionID")
			});
			oPlanVersionBC = oModel.createBindingContext(sPlanVersionPath);
			sVersionTitle = oPlanVersionBC.getProperty("versionNumber") + " ";
			switch (oPlanVersionBC.getProperty("useCase")) {
			case 0:
				sVersionTitle += this.getResourceBundle().getText("dailyPV");
				break;
			case 1:
				sVersionTitle += this.getResourceBundle().getText("weeklyPV");
				break;
			case 2:
				sVersionTitle += this.getResourceBundle().getText("monthlyPV");
				break;
			case 3:
				sVersionTitle += this.getResourceBundle().getText("longtermPV");
				break;
			default:
				sVersionTitle = "Error: Unknown type of plan version";
			}
			sVersionTitle += " " + oPlanVersionBC.getProperty("snapshotDate").toLocaleDateString();
			this.getModel("analyticsModel").setProperty("/chartTitle", sVersionTitle);
		},

		_createViewModel: function () {
			return new JSONModel({
				isFilterBarVisible: false,
				filterBarLabel: "",
				busy: false,
				delay: 0,
				analyticsTitle: "",
				chartTitle: "",
				selectedPlanVersion: ""
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

		setDataModel: function () {
			var oJSONModel = new JSONModel({
					"Values": [{
						"Value": "Planned Value, Earned Value, Actual Cost, Cost and Schedule Variance",
						"PV": "100000",
						"EV": "90000",
						"AC": "95000",
						"CV": "-5000",
						"SV": "-10000"
					}]
				}),
				cpi = 90000 / 95000,
				spi = 90000 / 100000,
				sTitle = "CPI " + parseFloat(cpi).toFixed(3) + " SPI " + parseFloat(spi).toFixed(3);
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
		}

	});

});
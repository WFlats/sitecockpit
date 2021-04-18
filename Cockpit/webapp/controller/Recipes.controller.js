sap.ui.define(["./BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/ui/Device",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator",
	"sap/ui/model/Sorter",
	"sap/m/GroupHeaderListItem",
	"sap/ui/core/Fragment",
	"sap/m/Dialog",
	"sap/m/MessageToast",
	"sap/m/MessageBox",
	"../model/formatter",
	"sap/m/library",
	"sap/base/Log"
], function (BaseController, JSONModel, Device, Filter, FilterOperator, Sorter, GroupHeaderListItem, Fragment, Dialog, MessageToast,
	MessageBox, formatter, mobileLibrary, Log) {
	"use strict";

	return BaseController.extend("cockpit.Cockpit.controller.Recipes", {

		/**
		 * Called when a controller is instantiated and its View controls (if available) are already created.
		 * Can be used to modify the View before it is displayed, to bind event handlers and do other one-time initialization.
		 * @memberOf cockpit.Cockpit.view.Recipes
		 */
		onInit: function () {
			var oRecipeList = this.byId("recipeList"),
				iOriginalBusyDelay = oRecipeList.getBusyIndicatorDelay(),
				oViewModel = this._createViewModel();

			this.setModel(oViewModel, "recipeModel");
			oRecipeList.attachEventOnce("updateFinished", function () {
				// Restore original busy indicator delay for the list
				oViewModel.setProperty("/delay", iOriginalBusyDelay);
			});
			this._oRecipeList = oRecipeList;
			this._oRecipeListFilterState = {
				aFilter: [],
				aSearch: []
			};
			this.getRouter().getRoute("Recipes").attachPatternMatched(this._onObjectMatched, this);
		},

		_onObjectMatched: function (oEvent) {
			// in pull mode switch to activeEndDate
			if (this.getModel("appView").getProperty("/pullMode")) {
				this.byId("DTP").setDateValue(this.getModel("appView").getProperty("/activeEndDate"));
			} else {
				this.byId("DTP").setDateValue(this.getModel("appView").getProperty("/activeStartDate"));
			}
			// load shifts into select control (binding in view doesn't work)
			var oSelect = this.byId("shiftSelect"),
				oDate = this.byId("DTP").getDateValue(),
				oWorkTimeModel = this.getModel("workTimeModel"),
				aShifts = oWorkTimeModel.getProperty("/shifts"); // was retrieved in detail controller

			oSelect.destroyItems();
			for (var i = 0; i < aShifts.length; i++) {
				var oItem = new sap.ui.core.Item({
					key: aShifts[i].ID,
					text: aShifts[i].code
				});
				if (aShifts[i].defaultShift) {
					oSelect.setSelectedKey(aShifts[i].ID);
					oItem.setText("*" + aShifts[i].code);
					// set the oDate if not within selected shift
					if (!this.inShift(oDate, aShifts[i])) {
						if (!this.getModel("appView").getProperty("/pullMode")) {
							oDate = this.getNextShiftStart(oDate, aShifts[i]);
						} else {
							oDate = this.getPreviousShiftEnd(oDate, aShifts[i]);
						}
						this.byId("DTP").setDateValue(oDate);
					}
				}
				oSelect.addItem(oItem);
			}
			/*
						//filter Crews by project
						var sProjectID = this.getModel("appView").getProperty("/selectedProjectID"),
							aFilter = [new Filter("project_ID", FilterOperator.EQ, sProjectID)];
						this.byId("crewSelect").getBinding("items").filter(aFilter, "Application");
			*/
			// set the project productivity factor
			var sProjectID = this.getModel("appView").getProperty("/selectedProjectID"),
				oModel = this.getModel(),
				sPath = "/" + oModel.createKey("Projects", {
					ID: sProjectID
				}),
				sProjectProdFactor = oModel.createBindingContext(sPath).getProperty("productivityFactor");
			if (!sProjectProdFactor) {
				sProjectProdFactor = "1.000";
			}
			this.byId("projectProdFactor").setValue(sProjectProdFactor);
			// set the min date of the dateTimePicker to now
			// problems with datepicker: error if am/pm is used in CET zone
			if (oDate < new Date()) {
				this.byId("DTP").setDateValue(new Date());
			}
			this.checkQuantity();
			this.handleShiftChange(); // checks if the date is within shift
		},

		onRecipeListUpdateFinished: function (oEvent) {
			this._updateRecipeListItemCount(oEvent.getParameter("total"));
		},

		_updateRecipeListItemCount: function (iTotalItems) {
			var sTitle;
			// only update the counter if the length is final
			if (this.byId("recipeList").getBinding("items").isLengthFinal()) {
				sTitle = this.getResourceBundle().getText("recipeListTitleCount", [iTotalItems]);
				this.getModel("recipeModel").setProperty("/recipeTitle", sTitle);
				this.getModel("recipeModel").setProperty("/countRecipes", iTotalItems);
			}
		},

		onRecipePick: function (oEvent) {
			var oList = oEvent.getSource(),
				sProjectID = this.getModel("appView").getProperty("/selectedProjectID"),
				sLocationID = this.getModel("appView").getProperty("/activeRowID"),
				oRecipe = oList.getSelectedItem().getBindingContext().getObject(),
				mQuantity = this.byId("quantity").getValue(),
				sShiftKey = this.byId("shiftSelect").getSelectedKey(),
				sProjectProdFactor = this.byId("projectProdFactor").getValue(),
				//sCrewKey = this.byId("crewSelect").getSelectedKey(),
				oModel = this.getModel(),
				sLocationPath = "/" + oModel.createKey("Locations", {
					ID: sLocationID
				}),
				aLocationTasks = oModel.getObject(sLocationPath, { // data is already read; Tasks are in aLocationTasks.tasks
					select: "tasks/estimatedEnd, tasks/waitDuration",
					expand: "tasks"
				}) || undefined,
				oTask = {},
				that = this,
				//oCrewForTask = {},
				oShift = this.getShiftFromID(sShiftKey),
				// in PULL mode sequences of tasks are placed one before each other
				bPull = this.getModel("appView").getProperty("/pullMode"),
				oPlannedStart = bPull ? undefined : this.byId("DTP").getDateValue(),
				oPlannedEnd = bPull ? this.byId("DTP").getDateValue() : undefined,
				oNow = new Date(),
				oPreviousTask;

			if ((bPull && oPlannedEnd < oNow) || (!bPull && oPlannedStart < oNow)) {
				MessageBox.error(this.getResourceBundle().getText("taskInPast"));
				return;
			}
			if (this.byId("DTP").getValueState() === "Error") {
				MessageBox.error(this.getResourceBundle().getText("invalidDateError"));
				return;
			}
			if (!sShiftKey || sShiftKey === "") {
				MessageBox.error(this.getResourceBundle().getText("noShiftsError"));
				return;
			}
			if (!mQuantity || mQuantity === "" || Number(mQuantity) <= 0) {
				MessageBox.error(this.getResourceBundle().getText("errorQuantity"));
				return;
			}
			if (!sProjectProdFactor || isNaN(sProjectProdFactor) || sProjectProdFactor <= 0) {
				MessageBox.error(this.getResourceBundle().getText("wrongFactorAtRecipeSelect"));
				return;
			}
			// adjust productivity to project
			oRecipe.productivity = parseFloat(oRecipe.productivity * sProjectProdFactor).toFixed(3);
			// apply waiting time
			if (bPull) {
				//if (oRecipe.waitDuration && this.getModel("appView").getProperty("/selectedTaskIDs").length > 0) {
				if (oRecipe.waitDuration) {
					// place before a selected task: waiting time of recipe (=current task) to be applied
					oPlannedEnd = new Date(oPlannedEnd.getTime() - oRecipe.waitDuration);
				}
			} else if (aLocationTasks && aLocationTasks.tasks.length > 0) { // find the previous task in the row
				aLocationTasks.tasks.sort(function (a, b) { // sort by end date
					return b.estimatedEnd - a.estimatedEnd;
				});
				oPreviousTask = aLocationTasks.tasks.find(function (oValue) {
					return oPlannedStart >= oValue.estimatedEnd;
				});
				// apply after placing on shift
			}
			// adjust dates to shift
			if (bPull) {
				oPlannedEnd = this.getPullEndDateInWorkingHours(oPlannedEnd, oShift);
				oPlannedStart = this.getPullStartDateInWorkingHours(oPlannedEnd, mQuantity, oRecipe.productivity, oShift);
			} else {
				oPlannedStart = this.getStartDateInWorkingHours(oPlannedStart, oShift);
				// check waiting time: if waiting time of previous task ends after new start date then adjust
				if (oPreviousTask && oPreviousTask.waitDuration &&
					new Date(oPreviousTask.estimatedEnd.getTime() + oPreviousTask.waitDuration) > oPlannedStart) {
					oPlannedStart = new Date(oPreviousTask.estimatedEnd.getTime() + oPreviousTask.waitDuration);
					oPlannedStart = this.getStartDateInWorkingHours(oPlannedStart, oShift);
				}
				oPlannedEnd = this.getEndDateInWorkingHours(oPlannedStart, mQuantity, oRecipe.productivity, oShift);
			}
			// check again
			if (oPlannedStart < oNow) {
				MessageBox.error(this.getResourceBundle().getText("taskInPast"));
				return;
			}

			this.getModel("recipeModel").setProperty("/busy", true);
			// create a new task
			this._nextTaskNumber(sProjectID, oRecipe.code).then(function (iNewNumber) {
				oTask.taskName = oRecipe.code;
				oTask.number = iNewNumber;
				oTask.shortText = oRecipe.shortText;
				oTask.colour = oRecipe.colour;
				oTask.quantity = parseFloat(mQuantity).toFixed(3);
				oTask.plannedProductivity = oRecipe.productivity; // is adjusted to project by factor
				oTask.productivityFactor = "1.000";
				oTask.currentProductivity = oRecipe.productivity;
				oTask.KPI = "1.000";
				oTask.plannedStart = oPlannedStart;
				oTask.plannedEnd = oPlannedEnd;
				oTask.estimatedEnd = oPlannedEnd;
				oTask.waitDuration = oRecipe.waitDuration;
				oTask.status = 0;
				oTask.recipe_ID = oRecipe.ID;
				oTask.project_ID = sProjectID;
				oTask.location_ID = sLocationID;
				oTask.UoM_ID = oRecipe.UoM_ID;
				oTask.discipline_ID = oRecipe.discipline_ID;
				oTask.shift_ID = sShiftKey;
				oModel.create("/Tasks", oTask, {
					success: function (oData) {
						that.getModel("recipeModel").setProperty("/busy", false);
						that.getModel("appView").setProperty("/selectedTaskIDs", [oData.ID]);
						// create crew assignment
						/*						if (sCrewKey) {
													oCrewForTask.project_ID = sProjectID;
													oCrewForTask.crew_ID = sCrewKey;
													oCrewForTask.task_ID = oData.ID;
													oModel.create("/CrewsForTask", oCrewForTask, {
														error: function (oError) {
															Log.error("Error creating crew assignment: " + JSON.stringify(oError));
														}
													});
												} */
					},
					error: function (oError) {
						Log.error("Error creating Task: " + JSON.stringify(oError));
						that.getModel("recipeModel").setProperty("/busy", false);
					}
				});
			});
			//DTP is bound to activeStartDate
			// in PULL mode this is the start of the newly created task (sequencing to the past)
			if (bPull) {
				this.getModel("appView").setProperty("/activeStartDate", oPlannedStart);
			} else {
				if (oTask.waitDuration) { // set the next startDate to after waitDuration
					oPlannedEnd = new Date(oPlannedEnd.getTime() + oTask.waitDuration);
					oPlannedEnd = this.getStartDateInWorkingHours(oPlannedEnd, oShift);
				}
				this.getModel("appView").setProperty("/activeStartDate", oPlannedEnd);
			}
		},

		onRecipeDragStart: function (oEvent) {
			var oDragSession = oEvent.getParameter("dragSession"),
				oDraggedRow = oEvent.getParameter("target");
			oDragSession.setComplexData("onRecipeDragContext", oDraggedRow);
		},

		onRecipeDragEnter: function (oEvent) {
			var oDragSession = oEvent.getParameter("dragSession"),
				oDraggedRow = oEvent.getParameter("target");
			oDragSession.setComplexData("onRecipeDragContext", oDraggedRow);
		},

		onRecipeSearch: function (oEvent) {
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
				this._oRecipeListFilterState.aSearch = [new Filter("shortText", FilterOperator.Contains, sQuery)];
			} else {
				this._oRecipeListFilterState.aSearch = [];
			}
			this._applyRecipeFilterSearch();
		},

		_applyRecipeFilterSearch: function () {
			var aFilters = this._oRecipeListFilterState.aSearch.concat(this._oRecipeListFilterState.aFilter),
				oViewModel = this.getModel("recipeModel");
			this._oRecipeList.getBinding("items").filter(aFilters, "Application");
			// changes the noDataText of the list in case there are no filter results
			if (aFilters.length !== 0) {
				oViewModel.setProperty("/noRecipeDataText", this.getResourceBundle().getText("recipeMasterListNoDataWithFilterOrSearchText"));
			} else if (this._oRecipeListFilterState.aSearch.length > 0) {
				// only reset the no data text to default when no new search was triggered
				oViewModel.setProperty("/noRecipeDataText", this.getResourceBundle().getText("recipeMasterListNoDataWithFilterOrSearchText"));
			}
		},

		_createViewModel: function () {
			return new JSONModel({
				isFilterBarVisible: false,
				filterBarLabel: "",
				busy: false,
				delay: 0,
				recipeTitle: this.getResourceBundle().getText("recipeListTitleCount", [0]),
				noRecipeDataText: this.getResourceBundle().getText("recipeMasterListNoDataText"),
				sortBy: "code",
				groupBy: "None",
				countRecipes: 0,
				countPulses: 0
			});
		},

		onCloseRecipePress: function () {
			this.getModel("appView").setProperty("/layout", "TwoColumnsMidExpanded");
			this.getModel("appView").setProperty("/actionButtonsInfo/midColumn/fullScreen", false);
			this.getModel("appView").setProperty("/mode", "None");
			this.getModel("appView").setProperty("/selectedTaskIDs", []);
			this.getRouter().navTo("object", {
				no: "0"
			}, true);
		},

		checkQuantity: function () {
			var oQuantity = this.byId("quantity"),
				mQuantity = oQuantity.getValue();
			if (mQuantity <= 0 || isNaN(mQuantity)) {
				oQuantity.setValueState("Error");
				oQuantity.setValueStateText(this.getResourceBundle().getText("quantityGreaterZero"));
			} else {
				oQuantity.setValueState("None");
				oQuantity.setValueStateText("");
			}
		},

		checkDateValue: function (oDP, oShift) {
			var oDate = oDP.getDateValue();
			if (oDate < new Date()) {
				oDP.setValueState("Error");
				oDP.setValueStateText(this.getResourceBundle().getText("dateInPast"));
				return;
			}
			if (!this.inShift(oDate, oShift)) {
				oDP.setValueState("Error");
				oDP.setValueStateText(this.getResourceBundle().getText("dateNotInShift"));
				return;
			}
			oDP.setValueState("None");
			oDP.setValueStateText("");
		},

		onStartDateChanged: function (oEvent) {
			var oDP = this.byId("DTP"),
				sShiftID = this.byId("shiftSelect").getSelectedKey(),
				oShift = this.getShiftFromID(sShiftID);

			if (oEvent.getParameter("valid")) {
				this.checkDateValue(oDP, oShift);
			} else {
				oDP.setValueState("Error");
				oDP.setValueStateText(this.getResourceBundle().getText("invalidDate"));
			}
		},

		handleShiftChange: function () {
			var oDP = this.byId("DTP"),
				sShiftID = this.byId("shiftSelect").getSelectedKey(),
				oShift = this.getShiftFromID(sShiftID);

			this.checkDateValue(oDP, oShift);
		},

		handleProjectProdFactor: function (oEvent) {
			if (oEvent.getParameter("value") <= 0) {
				this.byId("projectProdFactor").setValueState("Error");
				this.byId("projectProdFactor").setValueStateText("Factor must be > 0");
			} else {
				this.byId("projectProdFactor").setValueState("None");
				this.byId("projectProdFactor").setValueStateText("");
			}
		},

		onPullPushButtonPressed: function () {
			var oShift = this.getShiftFromID(this.byId("shiftSelect").getSelectedKey()),
				oDate = this.byId("DTP").getDateValue();
			// if oDate is at shift start/end set it to the opposite
			if (this.getModel("appView").getProperty("/pullMode") && oDate.getTime() === this.getShiftStart(oDate, oShift).getTime()) {
				oDate = this.getShiftEnd(oDate, oShift);
				this.byId("DTP").setDateValue(oDate);
			} else if (oDate.getTime() === this.getShiftEnd(oDate, oShift).getTime()) {
				oDate = this.getShiftStart(oDate, oShift);
				this.byId("DTP").setDateValue(oDate);
			}
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
		},

		getDiscipline: function (oContext) {
			var oDiscipline = oContext.getProperty("discipline"),
				oGroup = {
					key: oDiscipline.code,
					description: oDiscipline.description
				};
			return oGroup;
		},

		createGroupHeader: function (oGroup) {
			var sText = oGroup.key + " " + oGroup.description;
			return new GroupHeaderListItem({
				title: sText,
				upperCase: false
			});
		}

	});

});
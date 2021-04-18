sap.ui.define([
	"sap/ui/core/routing/History",
	"sap/ui/model/json/JSONModel",
	"recipe/RecipeEditor/controller/BaseController",
	"sap/ui/model/Filter",
	"sap/m/MessageBox",
	"sap/m/ColorPalettePopover",
	"../model/formatter"
], function (History, JSONModel, BaseController, Filter, MessageBox, ColorPalettePopover, formatter) {
	"use strict";

	return BaseController.extend("recipe.RecipeEditor.controller.CreateRecipe", {

		formatter: formatter,

		/**
		 * Called when a controller is instantiated and its View controls (if available) are already created.
		 * Can be used to modify the View before it is displayed, to bind event handlers and do other one-time initialization.
		 * @memberOf recipe.RecipeEditor.view.CreateRecipe
		 */
		onInit: function () {
			var iOriginalBusyDelay,
				oViewModel = new JSONModel({
					busy: true,
					delay: 0,
					mode: "",
					enableSave: false,
					viewTitle: "",
					recipeID: "",
					recipePath: "",
					recipeColor: ""
				});

			this.getRouter().getTargets().getTarget("create").attachDisplay(null, this._onDisplay, this);

			// Store original busy indicator delay, so it can be restored later on
			iOriginalBusyDelay = this.getView().getBusyIndicatorDelay();
			this.setModel(oViewModel, "createRecipeView");

			this.getOwnerComponent().getModel().metadataLoaded().then(function () {
				// Restore original busy indicator delay for the object view
				oViewModel.setProperty("/delay", iOriginalBusyDelay);
			});
		},

		/**
		 * Handles the onDisplay event which is triggered when this view is displayed 
		 * @param {sap.ui.base.Event} oEvent the on display event
		 * @private
		 */
		_onDisplay: function (oEvent) {
			var oData = oEvent.getParameter("data");
			if (oData) {
				switch (oData.mode) {
				case "Edit":
					this._onEdit(oEvent);
					break;
				case "Create":
					this._onCreate(oEvent);
					break;
				case "Copy":
					this._onCopy(oEvent);
					break;
				}
			}
		},

		/**
		 * Prepares the view for editing the selected object
		 * @param {sap.ui.base.Event} oEvent the  display event
		 * @private
		 */
		_onEdit: function (oEvent) {
			var oData = oEvent.getParameter("data"),
				oView = this.getView(),
				oViewModel = this.getModel("createRecipeView"),
				oModel = this.getModel(),
				sObjectPath = "/" + oModel.createKey("Recipes", {
					ID: oData.objectId
				});
			oViewModel.setProperty("/mode", "Edit");
			oViewModel.setProperty("/enableSave", false);
			oViewModel.setProperty("/viewTitle", this.getResourceBundle().getText("recipeEditTitle"));

			oView.bindElement({
				path: sObjectPath
			});
			var oRecipe = oModel.getObject(sObjectPath),
				sColour = oRecipe.colour;
			oViewModel.setProperty("/recipeColor", sColour);
			this.setWaitingTimeValues(oRecipe.waitDuration);
			this._validateSaveEnablement();
		},

		/**
		 * Prepares the view for creating new object
		 * @param {sap.ui.base.Event} oEvent the  display event
		 * @private
		 */

		_onCreate: function (oEvent) {
			var oViewModel = this.getModel("createRecipeView"),
				oModel = this.getModel();
			if (oEvent.getParameter("name") && oEvent.getParameter("name") !== "Create") {
				oViewModel.setProperty("/enableSave", false);
				this.getRouter().getTargets().detachDisplay(null, this._onDisplay, this);
				this.getView().unbindObject();
				return;
			}
			oViewModel.setProperty("/viewTitle", this.getResourceBundle().getText("recipeCreateTitle"));
			oViewModel.setProperty("/mode", "Create");
			var oContext = oModel.createEntry("Recipes", {
				success: this._fnEntityCreated.bind(this),
				error: this._fnEntityCreationFailed.bind(this)
			});
			this.getView().setBindingContext(oContext);
			this.setWaitingTimeValues(0);
			this._validateSaveEnablement();
		},

		_onCopy: function (oEvent) {
			var oViewModel = this.getModel("createRecipeView");
			if (oEvent.getParameter("name") && oEvent.getParameter("name") !== "Copy") {
				oViewModel.setProperty("/enableSave", false);
				this.getRouter().getTargets().detachDisplay(null, this._onDisplay, this);
				this.getView().unbindObject();
				return;
			}

			var oModel = this.getModel(),
				sObjectPath = "/" + oModel.createKey("Recipes", {
					ID: this.getModel("appView").getProperty("/selectedRecipeID")
				}),
				oClonedRecipe = oModel.getObject(sObjectPath, {
					select: "*"
				});
			oClonedRecipe.ID = undefined;
			oClonedRecipe.code = this.getResourceBundle().getText("CopyOf") + " " + oClonedRecipe.code;
			oViewModel.setProperty("/viewTitle", this.getResourceBundle().getText("recipeCopyTitle"));
			oViewModel.setProperty("/mode", "Copy");

			var oContext = oModel.createEntry("Recipes", {
				properties: oClonedRecipe,
				success: this._fnEntityCreated.bind(this),
				error: this._fnEntityCreationFailed.bind(this)
			});
			this.getView().setBindingContext(oContext);
			this.setWaitingTimeValues(oClonedRecipe.waitDuration);
			this._validateSaveEnablement();
		},

		setWaitingTimeValues: function (iMs) {
			var aValues = formatter.dhmFromMs(iMs);
			this.byId("waitingTimeDays").setValue(aValues[0]);
			this.byId("waitingTimeHours").setValue(aValues[1]);
			this.byId("waitingTimeMinutes").setValue(aValues[2]);
		},

		/**
		 * Handles the success of updating an object
		 * @private
		 */
		_fnUpdateSuccess: function () {
			this.getModel("appView").setProperty("/busy", false);
			this.getModel("appView").setProperty("/mode", "None");
			this.getView().unbindObject();
			this.getRouter().getTargets().display("object");
		},

		/**
		 * Handles the success of creating an object
		 *@param {object} oData the response of the save action
		 * @private
		 */
		_fnEntityCreated: function (oData) {
			var sObjectPath = this.getModel().createKey("Recipes", oData);
			// copy also required skills
			if (this.getModel("createRecipeView").getProperty("/mode") === "Copy") {
				this._copySkills(this.getModel("appView").getProperty("/selectedRecipeID"), oData.ID);
			}
			this.getModel("appView").setProperty("/itemToSelect", "/" + sObjectPath); //save last created
			this.getModel("appView").setProperty("/selectedRecipeID", oData.ID);
			this.getModel("appView").setProperty("/busy", false);
			this.getModel("appView").setProperty("/mode", "None");
			//this.getRouter().getTargets().display("object");
			this.getOwnerComponent().oListSelector.clearMasterListSelection();
			this.onCloseDetailPress();
		},

		/**
		 * Handles the failure of creating/updating an object
		 * @private
		 */
		_fnEntityCreationFailed: function () {
			this.getModel("appView").setProperty("/busy", false);
			this.getModel("appView").setProperty("/mode", "None");
		},

		_copySkills: function (sOldRecipeID, sNewRecipeID) {
			var oModel = this.getModel(),
				aFilter = [new Filter({
					path: "recipe_ID",
					operator: sap.ui.model.FilterOperator.EQ,
					value1: sOldRecipeID
				})];
			oModel.read("/SkillsForRecipe", {
				filters: aFilter,
				success: function (oData) {
					var aSkillsForRecipe = oData.results;
					for (var i = 0; i < aSkillsForRecipe.length; i++) {
						oModel.createEntry("SkillsForRecipe", {
							properties: {
								skill_ID: aSkillsForRecipe[i].skill_ID,
								recipe_ID: sNewRecipeID,
								rank: aSkillsForRecipe[i].rank
							}
						});
					}
					oModel.submitChanges();
				}
			});
		},

		onNavBack: function () {
			var sPreviousHash = History.getInstance().getPreviousHash();

			if (sPreviousHash !== undefined) {
				history.go(-1);
			} else {
				this.getRouter().navTo("master", {}, true);
			}
		},

		/**
		 * Event handler (attached declaratively) for the view save button. Saves the changes added by the user. 
		 * @function
		 * @public
		 */
		onSave: function () {
			var that = this,
				oModel = this.getModel(),
				oViewModel = this.getModel("createRecipeView"),
				oBC = this.getView().getBindingContext(),
				sCode = this.byId("code").getValue(),
				sShortText = this.byId("shortText").getValue(),
				sUoMID = this.byId("UoM").getSelectedKey(),
				sDisciplineID = this.byId("discipline").getSelectedKey(),
				sProductivity = this.byId("productivity").getValue(),
				sColour = oViewModel.getProperty("/recipeColor"),
				iWaiting = Number(this.byId("waitingTimeDays").getValue()) * 24 * 60 + Number(this.byId("waitingTimeHours").getValue()) * 60 +
				Number(this.byId("waitingTimeMinutes").getValue());
			iWaiting = iWaiting === 0 ? undefined : iWaiting * 60 * 1000; // must be set to undefined if 0

			this.getModel("appView").setProperty("/busy", true);
			this._bIsCodeUnique(sCode).then(function (bCodeUnique) {
				var bCanBeSaved = bCodeUnique;
				if (oViewModel.getProperty("/mode") === "Edit" && sCode === oModel.getProperty("code", oBC)) {
					bCanBeSaved = true; // if mode = Edit then the same code is valid
				}
				if (!bCanBeSaved) {
					MessageBox.information(
						that.getResourceBundle().getText("codeNotUnique"), {
							id: "codeNotUniqueInfoMessageBox",
							styleClass: that.getOwnerComponent().getContentDensityClass()
						}
					);
				} else {
					// set all values in the Model
					if (!oModel.setProperty("code", sCode, oBC) || !oModel.setProperty("shortText", sShortText, oBC) ||
						!oModel.setProperty("UoM_ID", sUoMID, oBC) || !oModel.setProperty("discipline_ID", sDisciplineID, oBC) ||
						!oModel.setProperty("productivity", sProductivity, oBC) || !oModel.setProperty("colour", sColour, oBC) ||
						!oModel.setProperty("waitDuration", iWaiting, oBC)) {
						MessageBox.error(that.getResourceBundle().getText("updateError"));
						that.getModel("appView").setProperty("/busy", false);
						oModel.resetChanges();
						return;
					}
					// abort if the  model has not been changed
					if (!oModel.hasPendingChanges()) {
						MessageBox.information(
							that.getResourceBundle().getText("noChangesMessage"), {
								id: "noChangesInfoMessageBox",
								styleClass: that.getOwnerComponent().getContentDensityClass()
							}
						);
						that.getModel("appView").setProperty("/busy", false);
						return;
					}
					if (oViewModel.getProperty("/mode") === "Edit") {
						// attach to the request completed event of the batch
						oModel.attachEventOnce("batchRequestCompleted", function (oEvent) {
							if (that._checkIfBatchRequestSucceeded(oEvent)) {
								that._fnUpdateSuccess();
							} else {
								that._fnEntityCreationFailed();
								MessageBox.error(that.getResourceBundle().getText("updateError"));
							}
						});
					}
					oModel.submitChanges();
				}
			});
		},

		/**
		 * Event handler (attached declaratively) for the view cancel button. Asks the user confirmation to discard the changes. 
		 * @function
		 * @public
		 */
		onCancel: function () {
			// check if the model has been changed
			if (this.getModel().hasPendingChanges()) {
				// get user confirmation first
				this._showConfirmQuitChanges(); // triggers resetChanges which also removes the created entity
			} else {
				this.getModel("appView").setProperty("/addEnabled", true);
				// cancel without confirmation
				this._navBack();
			}
		},

		_bIsCodeUnique: function (sCode) {
			var oModel = this.getModel(),
				sPath = "/Recipes",
				aFilter = [new Filter({
					path: "code",
					operator: sap.ui.model.FilterOperator.EQ,
					value1: sCode
				})];

			return new Promise(function (resolve, reject) {
				oModel.read(sPath, {
					urlParameters: {
						$inlinecount: "allpages",
						$top: 1
					},
					filters: aFilter,
					success: function (oData) {
						if (oData.results.length > 0) {
							resolve(false);
						} else {
							resolve(true);
						}
					},
					error: function () {
						resolve(false);
					}
				});
			});
		},

		_checkIfBatchRequestSucceeded: function (oEvent) {
			var oParams = oEvent.getParameters();
			var aRequests = oEvent.getParameters().requests;
			var oRequest;
			if (oParams.success) {
				if (aRequests) {
					for (var i = 0; i < aRequests.length; i++) {
						oRequest = oEvent.getParameters().requests[i];
						if (!oRequest.success) {
							return false;
						}
					}
				}
				return true;
			} else {
				return false;
			}
		},

		/**
		 * Checks if the save button can be enabled
		 * @private
		 */
		_validateSaveEnablement: function () {
			var aInputControls = this._getFormFields(this.byId("recipeForm"));
			var oControl,
				oViewModel = this.getModel("createRecipeView");

			oViewModel.setProperty("/enableSave", false);
			for (var m = 0; m < aInputControls.length; m++) {
				oControl = aInputControls[m].control;
				if (aInputControls[m].required) {
					var sValue = oControl.getValue();
					if (!sValue) {
						return; // mandatory values not entered
					}
				}
			}
			if (oViewModel.getProperty("/mode") === "Edit") {
				var oData = this.getView().getBindingContext().getObject(),
					sCode = this.byId("code").getValue(),
					sShortText = this.byId("shortText").getValue(),
					sUoMID = this.byId("UoM").getSelectedKey(),
					sDisciplineID = this.byId("discipline").getSelectedKey(),
					sProductivity = this.byId("productivity").getValue(),
					sColour = oViewModel.getProperty("/recipeColor"),
					iWaiting = Number(this.byId("waitingTimeDays").getValue()) * 24 * 60 + Number(this.byId("waitingTimeHours").getValue()) * 60 +
					Number(this.byId("waitingTimeMinutes").getValue());
				iWaiting = iWaiting * 60 * 1000;
				if (sCode === oData.code && sShortText === oData.shortText && sUoMID === oData.UoM_ID && oData.waitDuration === iWaiting) {
					if (sDisciplineID === oData.discipline_ID && sProductivity === oData.productivity && sColour === oData.colour) {
						return; // no changes made
					}
				}
			}
			if (this.byId("waitingTimeDays").getValueState() === "Error" ||
				this.byId("waitingTimeHours").getValueState() === "Error" ||
				this.byId("waitingTimeMinutes").getValueState() === "Error") {
				return;
			}
			oViewModel.setProperty("/enableSave", true);
		},

		_onWaitChange: function (oEvent) {
			var oInput = oEvent.getSource(),
				sValue = oEvent.getParameter("value");

			this.byId("waitingTimeDays").setValueState("None");
			this.byId("waitingTimeDays").setValueStateText("");
			this.byId("waitingTimeHours").setValueState("None");
			this.byId("waitingTimeHours").setValueStateText("");
			this.byId("waitingTimeMinutes").setValueState("None");
			this.byId("waitingTimeMinutes").setValueStateText("");
			if (oInput.toString().indexOf("Days") >= 0 && Number(sValue) < 0) {
				this.byId("waitingTimeDays").setValueState("Error");
				this.byId("waitingTimeDays").setValueStateText(this.getResourceBundle().getText("dayError"));
			}
			if (oInput.toString().indexOf("Hours") >= 0 && (Number(sValue) < 0 || Number(sValue) > 23)) {
				this.byId("waitingTimeHours").setValueState("Error");
				this.byId("waitingTimeHours").setValueStateText(this.getResourceBundle().getText("hoursError"));
			}
			if (oInput.toString().indexOf("Minutes") >= 0 && (Number(sValue) < 0 || Number(sValue) > 59)) {
				this.byId("waitingTimeMinutes").setValueState("Error");
				this.byId("waitingTimeMinutes").setValueStateText(this.getResourceBundle().getText("minutesError"));
			}
			this._validateSaveEnablement();
		},

		_onDisciplineChange: function () {
			var sDisciplineID = this.byId("discipline").getSelectedKey(),
				oModel = this.getModel(),
				sPath = oModel.createKey("/Disciplines", {
					ID: sDisciplineID
				}),
				oData = oModel.getObject(sPath, {
					select: "colour"
				}),
				oViewModel = this.getModel("createRecipeView"),
				sHexColour = oData.colour;

			oViewModel.setProperty("/recipeColor", sHexColour);
			this.byId("cp").setColorString(sHexColour);
			this._validateSaveEnablement();
		},

		/**
		 * Opens a dialog letting the user either confirm or cancel the quit and discard of changes.
		 * @private
		 */
		_showConfirmQuitChanges: function () {
			var oComponent = this.getOwnerComponent(),
				oModel = this.getModel();
			var that = this;
			MessageBox.confirm(
				this.getResourceBundle().getText("confirmCancelMessage"), {
					styleClass: oComponent.getContentDensityClass(),
					actions: [MessageBox.Action.YES, MessageBox.Action.NO],
					initialFocus: MessageBox.Action.NO,
					onClose: function (oAction) {
						if (oAction === sap.m.MessageBox.Action.YES) {
							that.getModel("appView").setProperty("/addEnabled", true);
							oModel.resetChanges();
							that._navBack();
						}
					}
				}
			);
		},

		/**
		 * Navigates back in the browser history, if the entry was created by this app.
		 * If not, it navigates to the Details page
		 * @private
		 */
		_navBack: function () {
			var oHistory = sap.ui.core.routing.History.getInstance(),
				sPreviousHash = oHistory.getPreviousHash();

			this.getView().unbindObject();
			if (sPreviousHash !== undefined) {
				// The history contains a previous entry
				history.go(-1);
			} else {
				this.getRouter().getTargets().display("object");
			}
		},

		/**
		 * Set the full screen mode to false and navigate to master page
		 */
		onCloseDetailPress: function () {
			this.getModel("appView").setProperty("/actionButtonsInfo/midColumn/fullScreen", false);
			this.getModel("appView").setProperty("/layout", "OneColumn");
			// No item should be selected on master after detail page is closed
			this.getOwnerComponent().oListSelector.clearMasterListSelection();
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

		colorPicked: function (oEvent) {
			this.getModel("createRecipeView").setProperty("/recipeColor", oEvent.getParameter("hex"));
			this._validateSaveEnablement();
		},

		/**
		 * Gets the form fields
		 * @param {sap.ui.layout.form} oSimpleForm the form in the view.
		 * @private
		 */
		_getFormFields: function (oSimpleForm) {
			var aControls = [];
			var aFormContent = oSimpleForm.getContent();
			var sControlType;
			for (var i = 0; i < aFormContent.length; i++) {
				sControlType = aFormContent[i].getMetadata().getName();
				if (sControlType === "sap.m.Input" || sControlType === "sap.m.TextArea" || sControlType === "sap.m.ColorPalette") { // selects will not be empty
					aControls.push({
						control: aFormContent[i],
						required: aFormContent[i - 1].getRequired && aFormContent[i - 1].getRequired()
					});
				}
			}
			return aControls;
		}

		/**
		 * Similar to onAfterRendering, but this hook is invoked before the controller's View is re-rendered
		 * (NOT before the first rendering! onInit() is used for that one!).
		 * @memberOf recipe.RecipeEditor.view.CreateRecipe
		 */
		/*onBeforeRendering: function () {
			this._onDisciplineChange();
		}*/

		/**
		 * Called when the View has been rendered (so its HTML is part of the document). Post-rendering manipulations of the HTML could be done here.
		 * This hook is the same one that SAPUI5 controls get after being rendered.
		 * @memberOf recipe.RecipeEditor.view.CreateRecipe
		 */
		//	onAfterRendering: function() {
		//
		//	},

		/**
		 * Called when the Controller is destroyed. Use this one to free resources and finalize activities.
		 * @memberOf recipe.RecipeEditor.view.CreateRecipe
		 */
		//	onExit: function() {
		//
		//	}

	});

});
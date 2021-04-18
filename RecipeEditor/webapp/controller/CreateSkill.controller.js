sap.ui.define([
	"sap/ui/core/routing/History",
	"sap/ui/model/json/JSONModel",
	"recipe/RecipeEditor/controller/BaseController",
	"sap/m/MessageBox",
	"sap/m/ColorPalettePopover",
	"../model/formatter"
], function (History, JSONModel, BaseController, MessageBox, ColorPalettePopover, formatter) {
	"use strict";

	return BaseController.extend("recipe.RecipeEditor.controller.CreateSkill", {

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
					skillID: "",
					skillPath: ""
				});

			this.getRouter().getTargets().getTarget("CreateSkill").attachDisplay(null, this._onDisplay, this);

			// Store original busy indicator delay, so it can be restored later on
			iOriginalBusyDelay = this.getView().getBusyIndicatorDelay();
			this.setModel(oViewModel, "createSkillView");

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
				oViewModel = this.getModel("createSkillView"),
				oModel = this.getModel(),
				sObjectPath = "/" + oModel.createKey("Skills", {
					ID: oData.objectId
				});
			oViewModel.setProperty("/mode", "Edit");
			oViewModel.setProperty("/enableSave", false);
			oViewModel.setProperty("/viewTitle", this.getResourceBundle().getText("skillEditTitle"));

			oView.bindElement({
				path: sObjectPath
			});
		},

		/**
		 * Prepares the view for creating new object
		 * @param {sap.ui.base.Event} oEvent the  display event
		 * @private
		 */

		_onCreate: function (oEvent) {
			var oViewModel = this.getModel("createSkillView");
			if (oEvent.getParameter("name") && oEvent.getParameter("name") !== "Create") {
				oViewModel.setProperty("/enableSave", false);
				this.getRouter().getTargets().detachDisplay(null, this._onDisplay, this);
				this.getView().unbindObject();
				return;
			}

			var oModel = this.getModel();
			oViewModel.setProperty("/viewTitle", this.getResourceBundle().getText("skillCreateTitle"));
			oViewModel.setProperty("/mode", "Create");
			var oContext = oModel.createEntry("Skills", {
				success: this._fnEntityCreated.bind(this),
				error: this._fnEntityCreationFailed.bind(this)
			});
			this.getView().setBindingContext(oContext);
		},

		_onCopy: function (oEvent) {
			var oViewModel = this.getModel("createSkillView");
			if (oEvent.getParameter("name") && oEvent.getParameter("name") !== "Copy") {
				oViewModel.setProperty("/enableSave", false);
				this.getRouter().getTargets().detachDisplay(null, this._onDisplay, this);
				this.getView().unbindObject();
				return;
			}

			var oModel = this.getModel(),
				sObjectPath = "/" + oModel.createKey("Skills", {
					ID: this.getModel("appView").getProperty("/selectedSkillID")
				}),
				oClonedSkill = oModel.getObject(sObjectPath, {
					select: "*"
				});
			oClonedSkill.ID = undefined;
			oViewModel.setProperty("/viewTitle", this.getResourceBundle().getText("skillCopyTitle"));
			oViewModel.setProperty("/mode", "Copy");

			var oContext = oModel.createEntry("Skills", {
				properties: oClonedSkill,
				success: this._fnEntityCreated.bind(this),
				error: this._fnEntityCreationFailed.bind(this)
			});
			this.getView().setBindingContext(oContext);
		},

		/**
		 * Handles the success of updating an object
		 * @private
		 */
		_fnUpdateSuccess: function () {
			this.getModel("appView").setProperty("/busy", false);
			this.getView().unbindObject();
			this.getRouter().getTargets().display("skills");
		},

		/**
		 * Handles the success of creating an object
		 *@param {object} oData the response of the save action
		 * @private
		 */
		_fnEntityCreated: function (oData) {
			var sObjectPath = this.getModel().createKey("Skills", oData);
			this.getModel("appView").setProperty("/selectedSkillID", "/" + sObjectPath); //save last created
			this.getModel("appView").setProperty("/busy", false);
			this.getRouter().getTargets().display("skills");
		},

		/**
		 * Handles the failure of creating/updating an object
		 * @private
		 */
		_fnEntityCreationFailed: function () {
			this.getModel("appView").setProperty("/busy", false);
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
				oViewModel = this.getModel("createSkillView"),
				oBC = this.getView().getBindingContext(),
				oComponent = this.getOwnerComponent(),
				sProfessionID = this.byId("profession").getSelectedKey(),
				sExperienceID = this.byId("experience").getSelectedKey();
			// set all values in the Model
			if (!oModel.setProperty("profession_ID", sProfessionID, oBC) || !oModel.setProperty("experience_ID", sExperienceID, oBC)) {
				MessageBox.error(that.getResourceBundle().getText("updateError"));
				return;
			}
			// abort if the  model has not been changed
			if (!oModel.hasPendingChanges()) {
				MessageBox.information(
					this.getResourceBundle().getText("noChangesMessage"), {
						id: "noChangesInfoMessageBox",
						styleClass: that.getOwnerComponent().getContentDensityClass()
					}
				);
				return;
			}
			this.getModel("appView").setProperty("/busy", true);
			if (oViewModel.getProperty("/mode") === "Edit") {
				MessageBox.confirm(
					this.getResourceBundle().getText("confirmChangeMessage"), {
						icon: MessageBox.Icon.WARNING,
						styleClass: oComponent.getContentDensityClass(),
						initialFocus: MessageBox.Action.NO,
						actions: [MessageBox.Action.YES, MessageBox.Action.NO],
						onClose: function (oAction) {
							if (oAction === sap.m.MessageBox.Action.NO) {
								that.getModel("appView").setProperty("/addEnabled", true);
								that.getModel("appView").setProperty("/busy", false);
								oModel.resetChanges();
								that._navBack();
							} else {
								// attach to the request completed event of the batch
								oModel.attachEventOnce("batchRequestCompleted", function (oEvent) {
									if (that._checkIfBatchRequestSucceeded(oEvent)) {
										that._fnUpdateSuccess();
									} else {
										that._fnEntityCreationFailed();
										MessageBox.error(that.getResourceBundle().getText("updateError"));
									}
								});
								oModel.submitChanges();
							}
						}
					}
				);
			} else {
				oModel.submitChanges();
			}
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
				this._showConfirmQuitChanges(); // some other thing here....
			} else {
				this.getModel("appView").setProperty("/addEnabled", true);
				// cancel without confirmation
				this.getModel("appView").setProperty("/busy", false);
				this.getView().unbindObject();
				this.getRouter().getTargets().display("skills");
			}
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
			var oViewModel = this.getModel("createSkillView"),
				oModel = this.getModel(),
				sObjectPath = "/" + oModel.createKey("Skills", {
					ID: this.getModel("appView").getProperty("/selectedSkillID")
				}),
				oSkill = oModel.getObject(sObjectPath, {
					select: "*"
				});

			if (this.byId("profession").getSelectedKey() !== oSkill.profession_ID || this.byId("experience").getSelectedKey() !== oSkill.experience_ID) {
				oViewModel.setProperty("/enableSave", true);
			} else {
				oViewModel.setProperty("/enableSave", false);
			}
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
					onClose: function (oAction) {
						if (oAction === sap.m.MessageBox.Action.OK) {
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
				this.getRouter().getTargets().display("skills");
			}
		},

		/**
		 * Set the full screen mode to false and navigate to master page
		 */
		onCloseDetailPress: function () {
			this.getModel("appView").setProperty("/actionButtonsInfo/midColumn/fullScreen", false);
			// No item should be selected on master after detail page is closed
			//			this.getOwnerComponent().oListSelector.clearMasterListSelection();
			//			this.getRouter().navTo("master");
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

		/**
		 * Similar to onAfterRendering, but this hook is invoked before the controller's View is re-rendered
		 * (NOT before the first rendering! onInit() is used for that one!).
		 * @memberOf recipe.RecipeEditor.view.CreateRecipe
		 */
		/*		onBeforeRendering: function () {
					
				} */

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
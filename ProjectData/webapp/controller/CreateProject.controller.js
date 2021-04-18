sap.ui.define([
	"sap/ui/core/routing/History",
	"sap/ui/model/json/JSONModel",
	"./BaseController",
	"sap/ui/model/Filter",
	"sap/m/MessageBox",
	"../model/formatter",
	"sap/ui/core/format/DateFormat"
], function (History, JSONModel, BaseController, Filter, MessageBox, formatter, DateFormat) {
	"use strict";

	return BaseController.extend("project.data.ProjectData.controller.CreateProject", {

		formatter: formatter,

		onInit: function () {
			var iOriginalBusyDelay,
				oViewModel = new JSONModel({
					busy: true,
					delay: 0,
					mode: "",
					enableSave: false,
					viewTitle: "",
					projectID: "",
					projectPath: ""
				});

			this.getRouter().getTargets().getTarget("CreateProject").attachDisplay(null, this._onDisplay, this);

			// Store original busy indicator delay, so it can be restored later on
			iOriginalBusyDelay = this.getView().getBusyIndicatorDelay();
			this.setModel(oViewModel, "createProjectView");

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
				oViewModel = this.getModel("createProjectView"),
				oModel = this.getModel(),
				sObjectPath = "/" + oModel.createKey("Projects", {
					ID: oData.objectId
				});
			oViewModel.setProperty("/mode", "Edit");
			oViewModel.setProperty("/enableSave", false);
			oViewModel.setProperty("/viewTitle", this.getResourceBundle().getText("projectEditTitle"));

			oView.bindElement({
				path: sObjectPath
			});
			var oProject = this.getView().getBindingContext().getObject({
				select: "*"
			});
			// the dateValue in the view doesn't take the properties from the binding
			this.byId("DPPS").setDateValue(oProject.plannedStartDate);
			this.byId("DPPE").setDateValue(oProject.plannedEndDate);
			this.byId("DPES").setDateValue(oProject.estimatedStartDate);
			this.byId("DPEE").setValue(oProject.estimatedEndDate);
			this.byId("DPAS").setValue(oProject.actualStartDate);
			this.byId("DPAE").setValue(oProject.actualEndDate);
		},

		/**
		 * Prepares the view for creating new object
		 * @param {sap.ui.base.Event} oEvent the  display event
		 * @private
		 */

		_onCreate: function (oEvent) {
			var oViewModel = this.getModel("createProjectView"),
				oModel = this.getModel();
			if (oEvent.getParameter("name") && oEvent.getParameter("name") !== "Create") {
				oViewModel.setProperty("/enableSave", false);
				this.getRouter().getTargets().detachDisplay(null, this._onDisplay, this);
				this.getView().unbindObject();
				return;
			}
			this.byId("code").setValue("");
			this.byId("description").setValue("");
			this.byId("address").setSelectedKey();
			this.byId("plannedCost").setValue();
			this.byId("currency").setValue();
			this.byId("productivity").setValue();
			this.byId("DPPS").setDateValue();
			this.byId("DPPS").setEnabled(true); // the element is not bound, so status = 0 is not true in the view
			this.byId("DPPE").setDateValue();
			this.byId("DPPE").setEnabled(true);
			this.byId("DPES").setDateValue();
			this.byId("DPES").setEnabled(true);
			this.byId("DPEE").setValue();
			this.byId("DPAS").setValue();
			this.byId("DPAE").setValue();
			oViewModel.setProperty("/viewTitle", this.getResourceBundle().getText("projectCreateTitle"));
			oViewModel.setProperty("/mode", "Create");
			var oContext = oModel.createEntry("Projects", {
				properties: {
					status: 0,
					productivityFactor: 1.000
				},
				success: this._fnEntityCreated.bind(this),
				error: this._fnEntityCreationFailed.bind(this)
			});
			this.getView().setBindingContext(oContext);
			// for whatever reason setProperty doesn't work here
			//oModel.setProperty("status", 0, oContext);
			//oModel.setProperty("productivityFactor", 1.000, oContext);
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
			this.getModel("appView").setProperty("/selectedProjectID", oData.ID);
			this.getModel("appView").setProperty("/busy", false);
			this.getModel("appView").setProperty("/mode", "None");
			//this.getRouter().getTargets().display("object", {
			//objectId: oData.ID
			//});
			this.getModel("appView").setProperty("/actionButtonsInfo/midColumn/fullScreen", false);
			this.getModel("appView").setProperty("/layout", "OneColumn");
			this.getOwnerComponent().oListSelector.clearMasterListSelection();
			this.getRouter().navTo("master");
		},

		/**
		 * Handles the failure of creating/updating an object
		 * @private
		 */
		_fnEntityCreationFailed: function () {
			this.getModel("appView").setProperty("/busy", false);
			this.getModel("appView").setProperty("/mode", "None");
		},

		onNavBack: function () {
			var sPreviousHash = History.getInstance().getPreviousHash();

			if (sPreviousHash !== undefined) {
				history.go(-1);
			} else {
				this.getRouter().getTargets().display("object");
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
				oViewModel = this.getModel("createProjectView"),
				oBC = this.getView().getBindingContext(),
				sCode = this.byId("code").getValue(),
				sDescription = this.byId("description").getValue(),
				sAddressID = this.byId("address").getSelectedKey(),
				sPlannedCost = this.byId("plannedCost").getValue(),
				sCurrency = this.byId("currency").getValue(),
				sProductivity = this.byId("productivity").getValue(),
				oPlannedStart = this.byId("DPPS").getDateValue(),
				oPlannedEnd = this.byId("DPPE").getDateValue(),
				oEstimatedStart = this.byId("DPES").getDateValue();

			oPlannedStart = this.adjustUTC(oPlannedStart);
			oPlannedEnd = this.adjustUTC(oPlannedEnd);
			oEstimatedStart = this.adjustUTC(oEstimatedStart);

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
					oModel.deleteCreatedEntry(oBC);
				} else {
					// set all values in the Model
					oModel.setProperty("code", sCode, oBC);
					oModel.setProperty("description", sDescription || undefined, oBC);
					oModel.setProperty("address_ID", sAddressID || undefined, oBC);
					oModel.setProperty("plannedCost", sPlannedCost || undefined, oBC);
					oModel.setProperty("currency_code", sCurrency || undefined, oBC);
					oModel.setProperty("productivityFactor", sProductivity || undefined, oBC);
					oModel.setProperty("plannedStartDate", oPlannedStart || undefined, oBC);
					oModel.setProperty("plannedEndDate", oPlannedEnd || undefined, oBC);
					oModel.setProperty("estimatedStartDate", oEstimatedStart || undefined, oBC);

					if (oViewModel.getProperty("/mode") === "Create") {
						// revisit: estimated End shall be calculated from tasks
						oModel.setProperty("estimatedEndDate", oEstimatedStart || undefined, oBC);
					}
					// abort if the  model has not been changed
					if (!oModel.hasPendingChanges()) {
						this.getModel("appView").setProperty("/busy", false);
						MessageBox.information(
							that.getResourceBundle().getText("noChangesMessage"), {
								id: "noChangesInfoMessageBox",
								styleClass: that.getOwnerComponent().getContentDensityClass()
							}
						);
						return;
					}
					// attach to the request completed event of the batch
					// in case of create the _fnEntityCreated is already attached
					if (oViewModel.getProperty("/mode") === "Edit") {
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
				this.getModel("appView").setProperty("/mode", "None");
				// cancel without confirmation
				this._navBack();
			}
		},

		_bIsCodeUnique: function (sCode) {
			var oModel = this.getModel(),
				sPath = "/Projects",
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
			var aInputControls = this._getFormFields(this.byId("projectForm"));
			var oControl,
				oViewModel = this.getModel("createProjectView");
			for (var m = 0; m < aInputControls.length; m++) {
				oControl = aInputControls[m].control;
				if (aInputControls[m].required) {
					if (!oControl.getValue()) {
						oViewModel.setProperty("/enableSave", false);
						return; // mandatory values not entered
					}
				}
			}
			if (oViewModel.getProperty("/mode") === "Edit") {
				var oData = this.getView().getBindingContext().getObject({
					select: "*"
				});
				var sCode = this.byId("code").getValue(),
					sDescription = this.byId("description").getValue(),
					sAddressID = this.byId("address").getSelectedKey(),
					sPlannedCost = this.byId("plannedCost").getValue(),
					sCurrency = this.byId("currency").getValue(),
					sProductivity = this.byId("productivity").getValue(),
					sPlannedStart = this.byId("DPPS").getDateValue(),
					sPlannedEnd = this.byId("DPPE").getDateValue(),
					sEstimatedStart = this.byId("DPES").getDateValue();
				if (sCode === oData.code && sDescription === oData.description && sAddressID === oData.address_ID) {
					if (sProductivity === oData.productivityFactor && sPlannedStart === oData.plannedStartDate && sPlannedEnd === oData.plannedEndDate &&
						sEstimatedStart === oData.estimatedStartDate && sPlannedCost === oData.plannedCost && sCurrency === oData.currency_code) {
						oViewModel.setProperty("/enableSave", false);
						return; // no changes made
					}
				}
			}
			oViewModel.setProperty("/enableSave", true);
			//			this._checkForErrorMessages();
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
							oModel.resetChanges(); // includes createdEntity
							if (that.getModel("appView").getProperty("/mode") !== "Create") {
								that._navBack();
							} else {
								that.getModel("appView").setProperty("/actionButtonsInfo/midColumn/fullScreen", false);
								that.getModel("appView").setProperty("/layout", "OneColumn");
								that.getModel("appView").setProperty("/mode", "None");
								// No item should be selected on master after detail page is closed
								oComponent.oListSelector.clearMasterListSelection();
								that.getRouter().navTo("master");
							}
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

			//this.getView().unbindObject(); // binding stays; back to same object
			// previousHash not defined when changing in master
			/*			if (sPreviousHash !== undefined) {
							// The history contains a previous entry
							history.go(-1);
						} else {
							this.getRouter().getTargets().display("object");
						}
			*/
			this.getModel("appView").setProperty("/mode", "None");
			this.getRouter().getTargets().display("object");
		},

		/**
		 * Set the full screen mode to false and navigate to master page
		 */
		onCloseDetailPress: function () {
			var sObjectId = this.getView().getBindingContext().getProperty("ID");
			this.getModel("appView").setProperty("/actionButtonsInfo/midColumn/fullScreen", false);
			/*			this.getRouter().getTargets().display("object", {
							objectId: sObjectId
						}); */
			this.getRouter().navTo("object", {
				objectId: sObjectId
			}, false);
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
				if (sControlType === "sap.m.Input" || sControlType === "sap.m.TextArea") { // selects will not be empty
					aControls.push({
						control: aFormContent[i],
						required: aFormContent[i - 1] && aFormContent[i - 1].getRequired()
					});
				}
			}
			return aControls;
		}

	});
});
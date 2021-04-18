sap.ui.define([
	"./BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/ui/model/Filter",
	"sap/m/MessageBox",
	"sap/m/ColumnListItem",
	"sap/m/Label",
	"sap/m/Token"
], function (BaseController, JSONModel, Filter, MessageBox, ColumnListItem, Label, Token) {
	"use strict";

	return BaseController.extend("master.data.MasterData.controller.CreatePerson", {

		onInit: function () {
			var oViewModel = new JSONModel({
					busy: true,
					delay: 0,
					mode: "",
					enableSave: false,
					personID: "",
					personPath: "",
					viewTitle: ""
				}),
				oCountryColModel = new JSONModel({
					"cols": [{
						"label": "Code",
						"template": "code"
					}, {
						"label": "Country",
						"template": "name"
					}]
				});
			this.setModel(oViewModel, "createPersonView");
			this.setModel(oCountryColModel, "countryColModel");
			this.getRouter().getTargets().getTarget("CreatePerson").attachDisplay(null, this._onDisplay, this);
		},

		_onDisplay: function (oEvent) {
			var sObjectId = oEvent.getParameter("data").objectId,
				sMode = oEvent.getParameter("data").mode,
				oModel = this.getModel(),
				sObjectPath = "";
			if (sMode === "Edit") {
				sObjectPath = "/" + oModel.createKey("Persons", {
					ID: sObjectId
				});
			}
			this.getModel("createPersonView").setProperty("/mode", sMode);
			this.getModel("createPersonView").setProperty("/personID", sObjectId);
			this.getModel("createPersonView").setProperty("/personPath", sObjectPath);
			this.getModel().metadataLoaded().then(function () {
				this._bindView(sObjectPath);
			}.bind(this));
		},

		_bindView: function (sObjectPath) {
			// Set busy indicator during view binding
			var oModel = this.getModel(),
				oViewModel = this.getModel("createPersonView");
			// If the view was not bound yet its not busy, only if the binding requests data it is set to busy again
			oViewModel.setProperty("/busy", false);
			if (oViewModel.getProperty("/mode") === "Edit") {
				oViewModel.setProperty("/viewTitle", this.getResourceBundle().getText("editPersonViewTitle"));
				this.getView().bindElement({
					path: sObjectPath,
					events: {
						dataRequested: function () {
							oViewModel.setProperty("/busy", true);
						},
						dataReceived: function () {
							oViewModel.setProperty("/busy", false);
						}
					}
				});
			} else {
				oViewModel.setProperty("/viewTitle", this.getResourceBundle().getText("createPersonViewTitle"));
				var oContext = oModel.createEntry("Persons");
				this.getView().setBindingContext(oContext);
			}
		},

		_validateSaveEnablement: function () {
			if (!this.getView().getBindingContext() || this.getView().getBindingContext() === undefined) { // this function gets called again on navback after unbindObject
				return;
			}
			var bSaveEnabled = false,
				oDP = this.byId("birthday"),
				bDateValid = !oDP.getDateValue() || oDP.isValidValue(),
				aInputControls = this._getFormFields(this.byId("personForm")).concat(this._getFormFields(this.byId("personForm2")));
			this.getModel("createPersonView").setProperty("/enableSave", bSaveEnabled);
			// if date entered manually and not valid, set error state and return
			if (bDateValid) {
				oDP.setValueState(sap.ui.core.ValueState.None);
			} else {
				oDP.setValueState(sap.ui.core.ValueState.Error);
				return;
			}
			// check if required fields are filled
			for (var i = 0; i < aInputControls.length; i++) {
				if (aInputControls[i].required && aInputControls[i].value === "") {
					return;
				}
			}
			if (this.getModel("createPersonView").getProperty("/mode") === "Edit") {
				var oData = this.getView().getBindingContext().getObject({
					select: "*"
				});
				// check if changes were made
				for (i = 0; i < aInputControls.length; i++) {
					if (aInputControls[i].value !== oData[aInputControls[i].id]) {
						// if the input is null && the oData field is undefined it also means no change made
						if (!(aInputControls[i].value === "" && oData[aInputControls[i].id] === undefined)) {
							bSaveEnabled = true;
							break;
						}
					}
				}
			} else {
				bSaveEnabled = true;
			}
			this.getModel("createPersonView").setProperty("/enableSave", bSaveEnabled);
		},

		onSave: function () {
			var oModel = this.getModel(),
				oBC = this.getView().getBindingContext(),
				sPersonnelID = this.byId("personnelID").getValue(),
				aInputControls = this._getFormFields(this.byId("personForm")).concat(this._getFormFields(this.byId("personForm2"))),
				that = this;

			this._isCodeUnique(sPersonnelID).then(function (bCodeUnique) {
				var bCanBeSaved = bCodeUnique;
				if (that.getModel("createPersonView").getProperty("/mode") === "Edit" && sPersonnelID === oModel.getProperty("personnelID",
						oBC)) {
					bCanBeSaved = true; // if mode = Edit then the same code is valid
				}
				if (!bCanBeSaved) {
					MessageBox.information(
						that.getResourceBundle().getText("personnelIDNotUnique"), {
							id: "codeNotUniqueInfoMessageBox"
						}
					);
				} else {
					// update oModel
					for (var i = 0; i < aInputControls.length; i++) {
						if (!oModel.setProperty(aInputControls[i].id, aInputControls[i].value, oBC)) {
							MessageBox.error(that.getResourceBundle().getText("updateError"));
							return;
						}
					}
					if (that.getModel("createPersonView").getProperty("/mode") === "Edit" && !oModel.hasPendingChanges()) {
						MessageBox.information(
							that.getResourceBundle().getText("noChangesMessage"), {
								id: "noChangesInfoMessageBox"
							}
						);
						return;
					}
					oModel.submitChanges();
					that.getView().unbindObject();
					that.onCancel();
				}
			});
		},

		onDelete: function () {
			var sPath = this.getView().getBindingContext().getPath(),
				sWorkerID = this.getView().getBindingContext().getProperty("ID"),
				oModel = this.getModel(),
				sConfirmTitle = this.getResourceBundle().getText("personDeleteConfirmationTitle"),
				sConfirmText = this.getResourceBundle().getText("personDeleteConfirmationText"),
				that = this,
				oDeploymentFilter = [new Filter("worker_ID", sap.ui.model.FilterOperator.EQ, sWorkerID)],
				removeWorkerDeployments = function () {
					oModel.read("/WorkerDeployments", {
						filters: oDeploymentFilter,
						success: function (oData) {
							if (oData.results.length > 0) {
								for (var i = 0; i < oData.results.length; i++) {
									var sDeploymentPath = "/" + oModel.createKey("WorkerDeployments", {
										ID: oData.results[i].ID
									});
									oModel.remove(sDeploymentPath);
								}
							}
						}
					});
				};

			MessageBox.confirm(
				sConfirmText, {
					icon: MessageBox.Icon.WARNING,
					title: sConfirmTitle,
					actions: [sap.m.MessageBox.Action.YES, sap.m.MessageBox.Action.NO],
					initialFocus: MessageBox.Action.NO,
					onClose: function (sAction) {
						if (sAction === "YES") {
							oModel.remove(sPath, {
								success: function (oResult) {
									removeWorkerDeployments();
								}
							});
							that.getView().unbindObject();
							that.onCancel();
						}
					}
				}
			);
		},

		onCancel: function () {
			var oModel = this.getModel();
			this.getModel("createPersonView").setProperty("/enableSave", false);
			if (this.getModel("createPersonView").getProperty("/mode") === "Create") {
				oModel.deleteCreatedEntry(this.getView().getBindingContext());
			}
			this.getView().unbindObject();
			this.getRouter().getTargets().display("Persons");
		},

		_isCodeUnique: function (sCode) {
			var oModel = this.getModel(),
				sPath = "/Persons",
				aFilter = [new Filter({
					path: "personnelID",
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

		_getFormFields: function (oSimpleForm) {
			var aControls = [],
				aFormContent = oSimpleForm.getContent(),
				sControlType,
				sValue, sID, idStart;
			for (var i = 0; i < aFormContent.length; i++) {
				sControlType = aFormContent[i].getMetadata().getName();
				if (sControlType === "sap.m.Input" || sControlType === "sap.m.Select" || sControlType === "sap.m.DatePicker") {
					sID = aFormContent[i].getId();
					idStart = sID.lastIndexOf("--", sID.length - 1);
					sID = sID.slice(idStart + 2, sID.length);
					if (sControlType === "sap.m.Input") {
						sValue = aFormContent[i].getValue();
					} else if (sControlType === "sap.m.Select") {
						sValue = aFormContent[i].getSelectedKey() || undefined;
					} else if (sControlType === "sap.m.DatePicker") {
						sValue = aFormContent[i].getDateValue();
					}
					aControls.push({
						id: sID,
						value: sValue,
						required: aFormContent[i - 1].getRequired && aFormContent[i - 1].getRequired()
					});
				}
			}
			return aControls;
		},

		onCountryValueHelpRequested: function () {
			if (!this._oDialog) {
				this._oDialog = sap.ui.xmlfragment("master.data.MasterData.view.SelectCountry", this);
			}
			this.getView().addDependent(this._oDialog);
			this._oDialog.addStyleClass("sapUiContentPadding");
			this._oDialog.open();
		},

		handleFragClose: function (oEvent) {
			var oItem = oEvent.getParameters("selectedItem"),
				sCountryCode = oItem.getBindingContext().getObject().code;

			this.byId("country_code").setValue(sCountryCode);
		},

		handleFragCancel: function (oEvent) {
			return;
		}

	});

});
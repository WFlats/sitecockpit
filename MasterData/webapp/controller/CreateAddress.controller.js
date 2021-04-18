sap.ui.define([
	"./BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/ui/model/Filter",
	"sap/m/MessageBox"
], function (BaseController, JSONModel, Filter, MessageBox) {
	"use strict";

	return BaseController.extend("master.data.MasterData.controller.CreateAddress", {

		onInit: function () {
			var oViewModel = new JSONModel({
					busy: true,
					delay: 0,
					mode: "",
					enableSave: false,
					addressID: "",
					addressPath: "",
					viewTitle: ""
				}),
				oSelectCountryViewModel = new JSONModel({
					busy: false, // there is no listUodateFinished event
					delay: 0
				});
			this.setModel(oViewModel, "createAddressView");
			this.setModel(oSelectCountryViewModel, "selectCountryView");
			this.getRouter().getTargets().getTarget("CreateAddress").attachDisplay(null, this._onDisplay, this);
		},

		_onDisplay: function (oEvent) {
			var sObjectId = oEvent.getParameter("data").objectId,
				sMode = oEvent.getParameter("data").mode,
				oModel = this.getModel(),
				sObjectPath = "";
			if (sMode === "Edit") {
				sObjectPath = "/" + oModel.createKey("Addresses", {
					ID: sObjectId
				});
			}
			this.getModel("createAddressView").setProperty("/mode", sMode);
			this.getModel("createAddressView").setProperty("/addressID", sObjectId);
			this.getModel("createAddressView").setProperty("/addressPath", sObjectPath);
			this.getModel().metadataLoaded().then(function () {
				this._bindView(sObjectPath);
			}.bind(this));
		},

		_bindView: function (sObjectPath) {
			// Set busy indicator during view binding
			var oModel = this.getModel(),
				oViewModel = this.getModel("createAddressView");
			// If the view was not bound yet its not busy, only if the binding requests data it is set to busy again
			oViewModel.setProperty("/busy", false);
			if (oViewModel.getProperty("/mode") === "Edit") {
				oViewModel.setProperty("/viewTitle", this.getResourceBundle().getText("editAddressViewTitle"));
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
				oViewModel.setProperty("/viewTitle", this.getResourceBundle().getText("createAddressViewTitle"));
				var oContext = oModel.createEntry("Addresses");
				this.getView().setBindingContext(oContext);
			}
		},

		_validateSaveEnablement: function () {
			if (!this.getView().getBindingContext() || this.getView().getBindingContext() === undefined) { // this function gets called again on navback after unbindObject
				return;
			}
			var bSaveEnabled = false,
				aInputControls = this._getFormFields(this.byId("addressForm"));
			this.getModel("createAddressView").setProperty("/enableSave", bSaveEnabled);
			// check if required fields are filled
			for (var i = 0; i < aInputControls.length; i++) {
				if (aInputControls[i].required && aInputControls[i].value === "") {
					return;
				}
			}
			if (this.getModel("createAddressView").getProperty("/mode") === "Edit") {
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
			this.getModel("createAddressView").setProperty("/enableSave", bSaveEnabled);
		},

		onSave: function () {
			var oModel = this.getModel(),
				oBC = this.getView().getBindingContext(),
				aInputControls = this._getFormFields(this.byId("addressForm"));

			// update oModel
			for (var i = 0; i < aInputControls.length; i++) {
				if (!oModel.setProperty(aInputControls[i].id, aInputControls[i].value || undefined, oBC)) {
					MessageBox.error(this.getResourceBundle().getText("updateError"));
					return;
				}
			}
			if (this.getModel("createAddressView").getProperty("/mode") === "Edit" && !oModel.hasPendingChanges()) {
				MessageBox.information(
					this.getResourceBundle().getText("noChangesMessage"), {
						id: "noChangesInfoMessageBox"
					}
				);
				return;
			}
			oModel.submitChanges();
			this.getView().unbindObject();
			this.onCancel();

		},

		onDelete: function () {
			var sPath = this.getView().getBindingContext().getPath(),
				oModel = this.getModel(),
				sConfirmTitle = this.getResourceBundle().getText("addressDeleteConfirmationTitle"),
				sConfirmText = this.getResourceBundle().getText("addressDeleteConfirmationText"),
				that = this;

			MessageBox.confirm(
				sConfirmText, {
					icon: MessageBox.Icon.WARNING,
					title: sConfirmTitle,
					actions: [sap.m.MessageBox.Action.YES, sap.m.MessageBox.Action.NO],
					initialFocus: MessageBox.Action.NO,
					onClose: function (sAction) {
						if (sAction === "YES") {
							oModel.remove(sPath);
							that.getView().unbindObject();
							that.onCancel();
						}
					}
				}
			);
		},

		onCancel: function () {
			var oModel = this.getModel();
			this.getModel("createAddressView").setProperty("/enableSave", false);
			if (this.getModel("createAddressView").getProperty("/mode") === "Create") {
				oModel.deleteCreatedEntry(this.getView().getBindingContext());
			}
			this.getView().unbindObject();
			this.getRouter().getTargets().display("Addresses");
		},

		_getFormFields: function (oSimpleForm) {
			var aControls = [];
			var aFormContent = oSimpleForm.getContent();
			var sControlType,
				sValue, sID, idStart;
			for (var i = 0; i < aFormContent.length; i++) {
				sControlType = aFormContent[i].getMetadata().getName();
				if (sControlType === "sap.m.Input" || sControlType === "sap.m.Select") {
					sID = aFormContent[i].getId();
					idStart = sID.lastIndexOf("--", sID.length - 1);
					sID = sID.slice(idStart + 2, sID.length);
					if (sControlType === "sap.m.Input") {
						sValue = aFormContent[i].getValue();
					} else if (sControlType === "sap.m.Select") {
						sValue = aFormContent[i].getSelectedKey();
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
		/*
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
		*/
	});

});
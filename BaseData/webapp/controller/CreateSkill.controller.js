sap.ui.define([
	"./BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/ui/model/Filter",
	"sap/m/MessageBox"
], function (BaseController, JSONModel, Filter, MessageBox) {
	"use strict";

	return BaseController.extend("base.data.BaseData.controller.CreateSkill", {

		onInit: function () {
			var oViewModel = new JSONModel({
				busy: true,
				delay: 0,
				mode: "",
				enableSave: false,
				skillID: "",
				skillPath: "",
				viewTitle: ""
			});
			this.setModel(oViewModel, "createSkillView");
			this.getRouter().getTargets().getTarget("CreateSkill").attachDisplay(null, this._onDisplay, this);
		},

		_onDisplay: function (oEvent) {
			var sObjectId = oEvent.getParameter("data").objectId,
				sMode = oEvent.getParameter("data").mode,
				oModel = this.getModel(),
				sObjectPath = "/" + oModel.createKey("Skills", {
					ID: sObjectId
				});
			this.getModel("createSkillView").setProperty("/mode", sMode);
			this.getModel("createSkillView").setProperty("/skillID", sObjectId);
			this.getModel("createSkillView").setProperty("/skillPath", sObjectPath);
			this.getModel().metadataLoaded().then(function () {
				this._bindView(sObjectPath);
			}.bind(this));
		},

		_bindView: function (sObjectPath) {
			// Set busy indicator during view binding
			var oModel = this.getModel(),
				oViewModel = this.getModel("createSkillView");
			// If the view was not bound yet its not busy, only if the binding requests data it is set to busy again
			oViewModel.setProperty("/busy", false);
			if (oViewModel.getProperty("/mode") === "Edit") {
				oViewModel.setProperty("/viewTitle", this.getResourceBundle().getText("editSkillViewTitle"));
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
				oViewModel.setProperty("/viewTitle", this.getResourceBundle().getText("createSkillViewTitle"));
				this.byId("profession").setSelectedKey();
				this.byId("experience").setSelectedKey();
				var oContext = oModel.createEntry("Skills");
				this.getView().setBindingContext(oContext);
			}
		},

		_validateSaveEnablement: function () {
			if (!this.getView().getBindingContext() || this.getView().getBindingContext() === undefined) { // this function gets called again on navback after unbindObject
				return;
			}
			var sProfessionID = this.byId("profession").getSelectedKey(),
				sExperienceID = this.byId("experience").getSelectedKey(),
				bSaveEnabled = false;
			if (this.getModel("createSkillView").getProperty("/mode") === "Create") {
				if (sProfessionID && sExperienceID) {
					bSaveEnabled = true;
				}
			} else { //Edit
				var oData = this.getView().getBindingContext().getObject({
					select: "*"
				});
				if (sProfessionID !== "" && sExperienceID !== "") {
					if (sProfessionID !== oData.profession_ID || sExperienceID !== oData.experience_ID) {
						bSaveEnabled = true;
					}
				}
			}
			this.getModel("createSkillView").setProperty("/enableSave", bSaveEnabled);
		},

		onSave: function () {
			var oModel = this.getModel(),
				oBC = this.getView().getBindingContext(),
				sProfessionID = this.byId("profession").getSelectedKey(),
				sExperienceID = this.byId("experience").getSelectedKey(),
				that = this;

			if (!oModel.setProperty("profession_ID", sProfessionID, oBC) || !oModel.setProperty("experience_ID", sExperienceID, oBC)) {
				MessageBox.error(that.getResourceBundle().getText("updateError"));
				return;
			}
			if (that.getModel("createSkillView").getProperty("/mode") === "Edit" && !oModel.hasPendingChanges()) {
				MessageBox.information(
					that.getResourceBundle().getText("noChangesMessage"), {
						id: "noChangesInfoMessageBox"
							//styleClass: that.getOwnerComponent().getContentDensityClass()
					}
				);
				return;
			}
			oModel.submitChanges();
			that.getView().unbindObject();
			that.onCancel();
		},

		onDelete: function () {
			var sPath = this.getView().getBindingContext().getPath(),
				oModel = this.getModel(),
				sConfirmTitle = this.getResourceBundle().getText("skillDeleteConfirmationTitle"),
				sConfirmText = this.getResourceBundle().getText("skillDeleteConfirmationText"),
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
			if (this.getModel("createSkillView").getProperty("/mode") === "Create") {
				oModel.deleteCreatedEntry(this.getView().getBindingContext());
			}
			this.getModel("createSkillView").setProperty("/enableSave", false);
			this.getView().unbindObject();
			this.getRouter().getTargets().display("Skills");
		}

	});

});